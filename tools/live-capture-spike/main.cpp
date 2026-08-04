// LMU Steward — live capture sidecar.
//
// Attaches to Le Mans Ultimate's first-party shared memory interface. Started
// as the Phase 0 spike answering the seven open questions in
// docs/live-capture-investigation.md, and still runs standalone for that:
// without --json it prints a human-readable diagnostic and a findings summary.
//
// With --json it is the app's capture process, spawned and supervised by
// src/main/api/live-capture.ts, emitting one JSON object per line on stdout.
//
// It reads and never writes. See the lock and snapshot sections below for the
// two places where the shipped SDK cannot be trusted to do that safely.

#include <optional>
#include <windows.h>
#include <tlhelp32.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "SharedMemoryInterface.hpp"

namespace {

constexpr const wchar_t* kProcessName = L"Le Mans Ultimate.exe";
constexpr DWORD kDiagnosticIntervalMs = 5000;

static SharedMemoryObjectOut gLocal;

struct Findings {
  bool sawMapping = false;
  bool sawScoring = false;
  bool sawTelemetry = false;
  bool sawRemoteVehicle = false;
  bool sawRemoteTelemetryNonZero = false;
  long gameVersion = 0;
  int trackLimitStepsPerPenalty = -1;
  int trackLimitStepsPerPoint = -1;
  std::set<int> flagValuesSeen;
  std::set<int> gamePhasesSeen;
  std::set<int> yellowStatesSeen;
  int maxActiveVehicles = 0;
  int maxNumVehicles = 0;
  unsigned long long resultsStreamBytes = 0;
  unsigned long stewardEventCount = 0;
  unsigned long scoreLineCount = 0;
  std::set<int> eventTypesSeen;
  std::set<std::string> incidentObjectKinds;
  unsigned long skippedContendedTicks = 0;
  unsigned long processedTicks = 0;
  unsigned long suppressedDuplicates = 0;
  unsigned long mirroredContacts = 0;
  unsigned long contextsEmitted = 0;
};

Findings gFindings;

// ---------------------------------------------------------------------------
// Cooperative lock — deliberately NOT SharedMemoryLock from the SDK.
//
// The SDK's Lock() slow path does:
//     return WaitForSingleObject(mWaitEventHandle, ms) == WAIT_OBJECT_0;
// which returns true WITHOUT re-acquiring `busy`. A caller that trusts it then
// calls Unlock(), clearing the busy flag while another process legitimately
// holds the lock — destroying mutual exclusion for every consumer of LMU's
// shared memory on the machine, including in-process plugins. That path also
// leaks a `waiters` increment.
//
// This is a read-only diagnostic, so it must never block or disrupt anyone.
// We only ever take the lock via a bounded try-acquire, and skip the update
// entirely if it is contended. Missing a tick is harmless: the buffer is not
// cleared between updates and we deduplicate on content anyway.
// ---------------------------------------------------------------------------
struct LmuLockData {
  volatile LONG waiters;
  volatile LONG busy;
};

HANDLE gLockMapping = nullptr;
HANDLE gLockEvent = nullptr;
LmuLockData* gLockData = nullptr;

bool InitCooperativeLock() {
  gLockMapping = CreateFileMappingA(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                                    static_cast<DWORD>(sizeof(LmuLockData)),
                                    "LMU_SharedMemoryLockData");
  if (!gLockMapping) {
    return false;
  }

  gLockData = static_cast<LmuLockData*>(
      MapViewOfFile(gLockMapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(LmuLockData)));
  if (!gLockData) {
    CloseHandle(gLockMapping);
    gLockMapping = nullptr;
    return false;
  }

  gLockEvent = CreateEventA(nullptr, FALSE, FALSE, "LMU_SharedMemoryLockEvent");
  return gLockEvent != nullptr;
}

bool TryAcquireLock() {
  constexpr int kMaxSpins = 400;
  for (int spin = 0; spin < kMaxSpins; ++spin) {
    if (InterlockedCompareExchange(&gLockData->busy, 1, 0) == 0) {
      return true;
    }
    YieldProcessor();
  }
  return false;
}

void ReleaseLock() {
  InterlockedExchange(&gLockData->busy, 0);
  if (gLockData->waiters > 0) {
    SetEvent(gLockEvent);
  }
}

void ShutdownCooperativeLock() {
  if (gLockEvent) {
    CloseHandle(gLockEvent);
  }
  if (gLockData) {
    UnmapViewOfFile(gLockData);
  }
  if (gLockMapping) {
    CloseHandle(gLockMapping);
  }
}

// ---------------------------------------------------------------------------
// Snapshot — deliberately NOT CopySharedMemoryObj from the SDK.
//
// The SDK's copy gates each section on `src.generic.events[SME_UPDATE_SCORING]`,
// i.e. slot 10 of the events array. But events[] is a QUEUE of fired event
// types terminated by SME_MAX (16), so slot 10 almost always holds the
// terminator — a truthy 16 — and the copy happens for the wrong reason. It
// works today by accident, and would silently stop copying scoring the moment
// slot 10 legitimately held SME_ENTER (0).
//
// A rolling telemetry buffer cannot rest on that, so we copy every section
// ourselves, unconditionally and bounds-checked. At ~317 KB and 50Hz this is
// roughly 16 MB/s, which measurement showed to be unremarkable.
// ---------------------------------------------------------------------------
struct TickEvents {
  bool scoringUpdated = false;
  bool telemetryUpdated = false;
  bool sessionStarted = false;
  bool sessionEnded = false;
};

TickEvents DecodeEvents(const SharedMemoryGeneric& generic) {
  TickEvents out;
  for (int i = 0; i < SME_MAX; ++i) {
    const unsigned value = static_cast<unsigned>(generic.events[i]);
    if (value >= SME_MAX) {
      break;
    }
    switch (value) {
      case SME_UPDATE_SCORING: out.scoringUpdated = true; break;
      case SME_UPDATE_TELEMETRY: out.telemetryUpdated = true; break;
      case SME_START_SESSION: out.sessionStarted = true; break;
      case SME_END_SESSION: out.sessionEnded = true; break;
      default: break;
    }
  }
  return out;
}

void CopyShared(SharedMemoryObjectOut& dst, const SharedMemoryObjectOut& src) {
  std::memcpy(&dst.generic, &src.generic, sizeof(SharedMemoryGeneric));

  std::memcpy(&dst.scoring.scoringInfo, &src.scoring.scoringInfo, sizeof(ScoringInfoV01));
  const long vehicles =
      std::min<long>(std::max<long>(src.scoring.scoringInfo.mNumVehicles, 0), 104);
  dst.scoring.scoringInfo.mNumVehicles = vehicles;
  std::memcpy(dst.scoring.vehScoringInfo, src.scoring.vehScoringInfo,
              static_cast<size_t>(vehicles) * sizeof(VehicleScoringInfoV01));

  // The SDK writes the terminator at [size] without checking, which overruns
  // when the stream fills the buffer exactly.
  const size_t streamSize =
      std::min<size_t>(src.scoring.scoringStreamSize, sizeof(dst.scoring.scoringStream) - 1);
  std::memcpy(dst.scoring.scoringStream, src.scoring.scoringStream, streamSize);
  dst.scoring.scoringStream[streamSize] = '\0';
  dst.scoring.scoringStreamSize = streamSize;

  dst.telemetry.activeVehicles = src.telemetry.activeVehicles;
  dst.telemetry.playerVehicleIdx = src.telemetry.playerVehicleIdx;
  dst.telemetry.playerHasVehicle = src.telemetry.playerHasVehicle;
  const int active = std::min<int>(static_cast<int>(src.telemetry.activeVehicles), 104);
  std::memcpy(dst.telemetry.telemInfo, src.telemetry.telemInfo,
              static_cast<size_t>(active) * sizeof(TelemInfoV01));

  // These point into LMU's address space; re-point them at our own copy so
  // nothing downstream can dereference a foreign address.
  dst.scoring.scoringInfo.mVehicle = &dst.scoring.vehScoringInfo[0];
  dst.scoring.scoringInfo.mResultsStream = &dst.scoring.scoringStream[0];
}

// --json emits one JSON object per line on stdout for the Electron main process
// to consume. Human-readable diagnostics are suppressed in this mode so stdout
// stays a clean machine channel; anything informational goes to stderr.
bool gJsonMode = false;

std::string JsonEscape(const std::string& value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (const char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

void EmitJson(const std::string& body) {
  std::printf("%s\n", body.c_str());
  std::fflush(stdout);
}

std::string gLastStream;

// LMU emits each <TrackLimits> element twice on the live stream (the written
// session XML contains it once). Suppress exact repeats so live counts agree
// with post-session counts.
std::set<std::string> gRecentStewardLines;

// A single car-to-car collision is reported twice — once from each car's
// perspective, ~0.1s apart with different magnitudes. Track the last few so the
// mirror can be recognised and folded into one incident.
struct ContactRecord {
  std::string reporter;
  std::string other;
  double et;
};
std::vector<ContactRecord> gRecentContacts;

std::string ExtractBetween(const std::string& line, const std::string& prefix,
                           const std::string& suffix) {
  const size_t start = line.find(prefix);
  if (start == std::string::npos) {
    return {};
  }
  const size_t from = start + prefix.size();
  const size_t end = line.find(suffix, from);
  if (end == std::string::npos) {
    return {};
  }
  return line.substr(from, end - from);
}

// Returns true when this line is the mirror of a collision already reported.
bool IsMirroredContact(const std::string& line) {
  const std::string marker = " reported contact ";
  const size_t markerPos = line.find(marker);
  if (markerPos == std::string::npos) {
    return false;
  }

  const size_t vehiclePos = line.find("with another vehicle ");
  if (vehiclePos == std::string::npos) {
    return false;
  }

  const size_t nameStart = line.find('>');
  if (nameStart == std::string::npos || nameStart > markerPos) {
    return false;
  }
  const std::string reporter = line.substr(nameStart + 1, markerPos - nameStart - 1);

  std::string other = line.substr(vehiclePos + 21);
  const size_t tagPos = other.find('<');
  if (tagPos != std::string::npos) {
    other = other.substr(0, tagPos);
  }

  const std::string etText = ExtractBetween(line, "et=\"", "\"");
  const double et = etText.empty() ? 0.0 : std::strtod(etText.c_str(), nullptr);

  for (const ContactRecord& prior : gRecentContacts) {
    if (prior.reporter == other && prior.other == reporter &&
        et - prior.et >= 0.0 && et - prior.et <= 1.5) {
      return true;
    }
  }

  gRecentContacts.push_back({reporter, other, et});
  if (gRecentContacts.size() > 32) {
    gRecentContacts.erase(gRecentContacts.begin());
  }
  return false;
}

// "Bradley Drake(0)" -> 0. Names are user-supplied and contain '#' and digits,
// so only a parenthesised run at the very end counts as the slot.
std::optional<long> ParseSlotId(const std::string& party) {
  const size_t close = party.find_last_of(')');
  if (close == std::string::npos || close + 1 != party.size()) {
    return std::nullopt;
  }
  const size_t open = party.find_last_of('(', close);
  if (open == std::string::npos || open + 1 == close) {
    return std::nullopt;
  }
  for (size_t i = open + 1; i < close; ++i) {
    if (party[i] < '0' || party[i] > '9') {
      return std::nullopt;
    }
  }
  return std::strtol(party.substr(open + 1, close - open - 1).c_str(), nullptr, 10);
}

// ---------------------------------------------------------------------------
// Rolling context buffer.
//
// This is the whole argument for live capture over log parsing: when an
// <Incident> line arrives we still hold the seconds either side of it, which
// the written XML structurally cannot carry.
//
// In memory only — nothing is recorded continuously. A window is emitted per
// incident and the buffer keeps overwriting itself otherwise.
// ---------------------------------------------------------------------------
constexpr int kMaxCars = 104;
// Sized for a 30s window at 50Hz. LMU was measured ticking nearer 25Hz, so the
// real coverage is roughly double that — headroom, not a bug. Nothing reads
// the nominal figure; BufferedSeconds() reports what is actually held.
constexpr double kBufferWindowSeconds = 30.0;
constexpr double kSampleIntervalSeconds = 0.02;
constexpr int kBufferFrames =
    static_cast<int>(kBufferWindowSeconds / kSampleIntervalSeconds);
constexpr double kPreWindowSeconds = 6.0;
constexpr double kPostWindowSeconds = 2.0;
// Telemetry ticks unevenly at roughly 30-50Hz, so this floor decimates only
// where samples bunch up rather than imposing a fixed grid. Frames carry their
// own t, which is authoritative — do not assume a constant spacing.
constexpr double kEmitIntervalSeconds = 0.03;
constexpr double kPi = 3.14159265358979323846;

struct CarSample {
  bool valid;
  float x, y, z;
  float vx, vy, vz;
  float speed;
  float yaw;
  float throttle, brake, steering;
  float lapDist, pathLateral, trackEdge;
  int32_t lap;
  uint8_t flag;
  int8_t sector;
};

struct BufferFrame {
  double et;         // telemetry clock (mElapsedTime), ~50Hz
  double currentEt;  // scoring clock (mCurrentET) — the clock et= is quoted in
  // Raw mSectorFlag, not booleanised. Observed as 1/1/1 throughout a green
  // practice session, so whatever LMU puts here it is not "local yellow in
  // this sector". Carried through unconverted until that is understood.
  int8_t sectorFlags[3];
  CarSample cars[kMaxCars];
};

// ~10 MB, allocated once. Never grows, never reallocates mid-session.
std::vector<BufferFrame> gBuffer;
int gBufferHead = 0;
int gBufferCount = 0;
double gLastSampleEt = -1e9;

// Telemetry and scoring are timestamped by two different fields. Nothing here
// assumes they agree — incidents are anchored on the scoring clock — but the
// difference is surfaced so a real session can confirm it.
double gEtClockDelta = 0.0;

// Slot IDs are arbitrary and reused; map them onto dense indices for the ring.
std::map<long, int> gSlotToIndex;
long gIndexToSlot[kMaxCars] = {};
int gCarCount = 0;

void ResetContextBuffer() {
  gBufferHead = 0;
  gBufferCount = 0;
  gLastSampleEt = -1e9;
  gSlotToIndex.clear();
  gCarCount = 0;
}

// Real coverage, not frames x nominal interval: LMU's telemetry tick is uneven
// and slower than the sample floor, so the nominal figure is always wrong.
double BufferedSeconds() {
  if (gBufferCount < 2) {
    return 0.0;
  }
  const int first = (gBufferHead - gBufferCount + kBufferFrames) % kBufferFrames;
  const int last = (gBufferHead - 1 + kBufferFrames) % kBufferFrames;
  return gBuffer[last].et - gBuffer[first].et;
}

int CarIndex(long slotId) {
  const auto found = gSlotToIndex.find(slotId);
  if (found != gSlotToIndex.end()) {
    return found->second;
  }
  if (gCarCount >= kMaxCars) {
    return -1;
  }
  const int index = gCarCount++;
  gSlotToIndex[slotId] = index;
  gIndexToSlot[index] = slotId;
  return index;
}

void CaptureFrame() {
  const SharedMemoryTelemetryData& telemetry = gLocal.telemetry;
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;

  const int active = std::min<int>(static_cast<int>(telemetry.activeVehicles), kMaxCars);
  if (active == 0) {
    return;
  }

  const double et = telemetry.telemInfo[0].mElapsedTime;

  // A backwards clock means a new session or a replay scrub; a full index table
  // means the roster has churned past capacity. Both are cleaner to restart
  // from than to paper over.
  if (et < gLastSampleEt || gCarCount >= kMaxCars) {
    ResetContextBuffer();
  }
  if (et - gLastSampleEt < kSampleIntervalSeconds) {
    return;
  }
  gLastSampleEt = et;
  gEtClockDelta = scoring.mCurrentET - et;

  BufferFrame& frame = gBuffer[gBufferHead];
  frame.et = et;
  frame.currentEt = scoring.mCurrentET;
  for (int s = 0; s < 3; ++s) {
    frame.sectorFlags[s] = scoring.mSectorFlag[s];
  }
  for (int i = 0; i < kMaxCars; ++i) {
    frame.cars[i].valid = false;
  }

  // Track-relative state arrives on scoring (~5Hz), inputs and kinematics on
  // telemetry (~50Hz). They are merged per car so a brake trace is never held
  // without the position context that makes it evidence rather than noise.
  const VehicleScoringInfoV01* scoringFor[kMaxCars] = {};
  const long vehicles = std::min<long>(scoring.mNumVehicles, kMaxCars);
  for (long i = 0; i < vehicles; ++i) {
    const VehicleScoringInfoV01& veh = gLocal.scoring.vehScoringInfo[i];
    const int index = CarIndex(veh.mID);
    if (index >= 0) {
      scoringFor[index] = &veh;
    }
  }

  for (int i = 0; i < active; ++i) {
    const TelemInfoV01& telem = telemetry.telemInfo[i];
    const int index = CarIndex(telem.mID);
    if (index < 0) {
      continue;
    }

    CarSample& sample = frame.cars[index];
    sample.valid = true;
    sample.x = static_cast<float>(telem.mPos.x);
    sample.y = static_cast<float>(telem.mPos.y);
    sample.z = static_cast<float>(telem.mPos.z);

    // mLocalVel is in vehicle-local coordinates; the rows of mOri convert a
    // local vector into world X/Y/Z by dot product. World velocity is what the
    // closing-speed derivation needs.
    const TelemVect3& v = telem.mLocalVel;
    sample.vx = static_cast<float>(telem.mOri[0].x * v.x + telem.mOri[0].y * v.y +
                                   telem.mOri[0].z * v.z);
    sample.vy = static_cast<float>(telem.mOri[1].x * v.x + telem.mOri[1].y * v.y +
                                   telem.mOri[1].z * v.z);
    sample.vz = static_cast<float>(telem.mOri[2].x * v.x + telem.mOri[2].y * v.y +
                                   telem.mOri[2].z * v.z);
    sample.speed = static_cast<float>(std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z));
    sample.yaw = static_cast<float>(telem.mLocalRot.y * 180.0 / kPi);

    sample.throttle = static_cast<float>(telem.mUnfilteredThrottle);
    sample.brake = static_cast<float>(telem.mUnfilteredBrake);
    sample.steering = static_cast<float>(telem.mUnfilteredSteering);
    sample.lap = static_cast<int32_t>(telem.mLapNumber);

    const VehicleScoringInfoV01* veh = scoringFor[index];
    sample.lapDist = veh ? static_cast<float>(veh->mLapDist) : 0.0f;
    sample.pathLateral = veh ? static_cast<float>(veh->mPathLateral) : 0.0f;
    sample.trackEdge = veh ? static_cast<float>(veh->mTrackEdge) : 0.0f;
    sample.flag = veh ? veh->mFlag : 0;
    sample.sector = veh ? veh->mSector : -1;
  }

  gBufferHead = (gBufferHead + 1) % kBufferFrames;
  if (gBufferCount < kBufferFrames) {
    ++gBufferCount;
  }
}

// ---------------------------------------------------------------------------
// Incident contexts.
//
// The window we want straddles the incident, but at the moment the <Incident>
// line arrives only the "before" half exists. So each incident is parked and
// emitted once the session clock has run past it far enough.
// ---------------------------------------------------------------------------
struct PendingContext {
  unsigned long seq;
  double et;
  std::vector<long> slotIds;
};

std::vector<PendingContext> gPending;
unsigned long gStewardSeq = 0;

void RegisterIncidentContext(unsigned long seq, double et, std::vector<long> slotIds) {
  if (slotIds.empty() || et <= 0.0) {
    return;
  }
  gPending.push_back({seq, et, std::move(slotIds)});
  if (gPending.size() > 32) {
    gPending.erase(gPending.begin());
  }
}

void EmitIncidentContext(const PendingContext& pending) {
  if (gBufferCount == 0) {
    return;
  }

  const int first = (gBufferHead - gBufferCount + kBufferFrames) % kBufferFrames;

  // The two clocks need not agree, so the incident is anchored on the scoring
  // clock (which is what et= is quoted in) and everything downstream is
  // expressed relative to that frame's telemetry clock. Resolution is one
  // scoring tick, which is inherent — et= itself is only quoted to 0.1s.
  int anchor = -1;
  double bestDelta = 0.0;
  for (int k = 0; k < gBufferCount; ++k) {
    const BufferFrame& frame = gBuffer[(first + k) % kBufferFrames];
    const double delta = std::fabs(frame.currentEt - pending.et);
    if (anchor < 0 || delta < bestDelta) {
      anchor = k;
      bestDelta = delta;
    }
  }
  if (anchor < 0) {
    return;
  }

  const BufferFrame& anchorFrame = gBuffer[(first + anchor) % kBufferFrames];
  const double anchorEt = anchorFrame.et;

  std::string out;
  out.reserve(96 * 1024);

  char header[512];
  std::snprintf(header, sizeof(header),
                "{\"type\":\"incident_context\",\"seq\":%lu,\"et\":%.3f,"
                "\"trackLength\":%.1f,\"anchorErrorSeconds\":%.3f,"
                "\"sectorFlags\":[%d,%d,%d],\"cars\":[",
                pending.seq, pending.et, gLocal.scoring.scoringInfo.mLapDist,
                bestDelta,
                static_cast<int>(anchorFrame.sectorFlags[0]),
                static_cast<int>(anchorFrame.sectorFlags[1]),
                static_cast<int>(anchorFrame.sectorFlags[2]));
  out += header;

  bool firstCar = true;
  for (const long slotId : pending.slotIds) {
    const auto found = gSlotToIndex.find(slotId);
    if (found == gSlotToIndex.end()) {
      continue;
    }
    const int index = found->second;

    char carHeader[64];
    std::snprintf(carHeader, sizeof(carHeader), "%s{\"slotId\":%ld,\"frames\":[",
                  firstCar ? "" : ",", slotId);
    out += carHeader;
    firstCar = false;

    bool firstFrame = true;
    double lastEmitted = -1e9;

    for (int k = 0; k < gBufferCount; ++k) {
      const BufferFrame& frame = gBuffer[(first + k) % kBufferFrames];
      const double t = frame.et - anchorEt;
      if (t < -kPreWindowSeconds || t > kPostWindowSeconds) {
        continue;
      }
      if (!frame.cars[index].valid) {
        continue;
      }
      if (frame.et - lastEmitted < kEmitIntervalSeconds * 0.98) {
        continue;
      }
      lastEmitted = frame.et;

      const CarSample& s = frame.cars[index];
      char entry[512];
      std::snprintf(entry, sizeof(entry),
                    "%s{\"t\":%.3f,\"x\":%.2f,\"y\":%.2f,\"z\":%.2f,"
                    "\"vx\":%.2f,\"vy\":%.2f,\"vz\":%.2f,\"speed\":%.2f,\"yaw\":%.1f,"
                    "\"throttle\":%.3f,\"brake\":%.3f,\"steering\":%.3f,"
                    "\"lapDist\":%.1f,\"pathLateral\":%.2f,\"trackEdge\":%.2f,"
                    "\"flag\":%u,\"sector\":%d,\"lap\":%d}",
                    firstFrame ? "" : ",", t, s.x, s.y, s.z, s.vx, s.vy, s.vz,
                    s.speed, s.yaw, s.throttle, s.brake, s.steering, s.lapDist,
                    s.pathLateral, s.trackEdge, static_cast<unsigned>(s.flag),
                    static_cast<int>(s.sector), static_cast<int>(s.lap));
      out += entry;
      firstFrame = false;
    }

    out += "]}";
  }

  out += "]}";
  EmitJson(out);
}

void FlushPendingContexts(double currentEt) {
  for (size_t i = 0; i < gPending.size();) {
    const PendingContext& pending = gPending[i];

    // The clock running backwards means a new session; the window is gone.
    if (currentEt + 1.0 < pending.et) {
      gPending.erase(gPending.begin() + static_cast<long>(i));
      continue;
    }
    if (currentEt < pending.et + kPostWindowSeconds) {
      ++i;
      continue;
    }

    if (gJsonMode) {
      EmitIncidentContext(pending);
    } else {
      std::printf("    + context for incident #%lu at et=%.1f (%zu car(s), %.1fs buffered)\n",
                  pending.seq, pending.et, pending.slotIds.size(),
                  BufferedSeconds());
    }
    ++gFindings.contextsEmitted;
    gPending.erase(gPending.begin() + static_cast<long>(i));
  }
}

bool gDumpedEvents = false;
long gLastSession = -12345;
unsigned char gLastGamePhase = 255;

const char* EventName(int index) {
  switch (index) {
    case SME_ENTER: return "ENTER";
    case SME_EXIT: return "EXIT";
    case SME_STARTUP: return "STARTUP";
    case SME_SHUTDOWN: return "SHUTDOWN";
    case SME_LOAD: return "LOAD";
    case SME_UNLOAD: return "UNLOAD";
    case SME_START_SESSION: return "START_SESSION";
    case SME_END_SESSION: return "END_SESSION";
    case SME_ENTER_REALTIME: return "ENTER_REALTIME";
    case SME_EXIT_REALTIME: return "EXIT_REALTIME";
    case SME_UPDATE_SCORING: return "UPDATE_SCORING";
    case SME_UPDATE_TELEMETRY: return "UPDATE_TELEMETRY";
    case SME_INIT_APPLICATION: return "INIT_APPLICATION";
    case SME_UNINIT_APPLICATION: return "UNINIT_APPLICATION";
    case SME_SET_ENVIRONMENT: return "SET_ENVIRONMENT";
    case SME_FFB: return "FFB";
    default: return "?";
  }
}

// generic.events[] is a QUEUE of event types that fired this update, not an
// array indexed by event type. Entries are valid enum values; SME_MAX (16) is
// the terminator / empty-slot sentinel.
void DumpEventsArray(const char* when) {
  std::printf("\n=== generic.events[] raw slots (%s) ===\n", when);
  for (int i = 0; i < SME_MAX; ++i) {
    const unsigned value = static_cast<unsigned>(gLocal.generic.events[i]);
    if (value >= SME_MAX) {
      std::printf("  [%2d] = %u  <terminator>\n", i, value);
      break;
    }
    std::printf("  [%2d] = %u  %s\n", i, value, EventName(static_cast<int>(value)));
  }
  std::printf("  Slots hold fired event TYPES in order; %d marks the end.\n", SME_MAX);
}

// Walk the queue and record which event types actually fire.
void ProcessEventQueue() {
  for (int i = 0; i < SME_MAX; ++i) {
    const unsigned value = static_cast<unsigned>(gLocal.generic.events[i]);
    if (value >= SME_MAX) {
      break;
    }

    gFindings.eventTypesSeen.insert(static_cast<int>(value));

    if (gJsonMode) {
      continue;
    }
    if (value == SME_START_SESSION) {
      std::printf("\n>>> SME_START_SESSION\n");
    } else if (value == SME_END_SESSION) {
      std::printf("\n>>> SME_END_SESSION\n");
    }
  }
}

DWORD FindProcessId(const wchar_t* name) {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    return 0;
  }

  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  DWORD pid = 0;

  if (Process32FirstW(snapshot, &entry)) {
    do {
      if (_wcsicmp(entry.szExeFile, name) == 0) {
        pid = entry.th32ProcessID;
        break;
      }
    } while (Process32NextW(snapshot, &entry));
  }

  CloseHandle(snapshot);
  return pid;
}

const char* ControlLabel(signed char control) {
  switch (control) {
    case -1: return "nobody";
    case 0: return "local-player";
    case 1: return "local-AI";
    case 2: return "remote";
    case 3: return "replay";
    default: return "unknown";
  }
}

void ReportLayout() {
  std::printf("\n=== [7] Struct layout ===\n");
  std::printf("  sizeof(SharedMemoryObjectOut) = %zu bytes\n", sizeof(SharedMemoryObjectOut));
  std::printf("  sizeof(ScoringInfoV01)        = %zu\n", sizeof(ScoringInfoV01));
  std::printf("  sizeof(VehicleScoringInfoV01) = %zu\n", sizeof(VehicleScoringInfoV01));
  std::printf("  sizeof(TelemInfoV01)          = %zu\n", sizeof(TelemInfoV01));
  std::printf("  offsetof(scoring)             = %zu\n", offsetof(SharedMemoryObjectOut, scoring));
  std::printf("  offsetof(telemetry)           = %zu\n", offsetof(SharedMemoryObjectOut, telemetry));
  std::printf("  (record these - a change across LMU updates means the port drifted)\n");
}

void EmitStewardEventJson(const std::string& line, bool isMirror, unsigned long seq);

// Slots named by a contact line: the reporter, plus the struck car when the
// object was another vehicle rather than a wall, cone or sign.
std::vector<long> ExtractIncidentSlots(const std::string& line) {
  std::vector<long> slots;

  const size_t markerPos = line.find(" reported contact ");
  const size_t nameStart = line.find('>');
  if (markerPos == std::string::npos || nameStart == std::string::npos ||
      nameStart > markerPos) {
    return slots;
  }

  if (const auto reporter =
          ParseSlotId(line.substr(nameStart + 1, markerPos - nameStart - 1))) {
    slots.push_back(*reporter);
  }

  const std::string vehicleMarker = "with another vehicle ";
  const size_t vehiclePos = line.find(vehicleMarker);
  if (vehiclePos == std::string::npos) {
    return slots;
  }

  std::string other = line.substr(vehiclePos + vehicleMarker.size());
  const size_t tagPos = other.find('<');
  if (tagPos != std::string::npos) {
    other = other.substr(0, tagPos);
  }
  if (const auto otherSlot = ParseSlotId(other)) {
    slots.push_back(*otherSlot);
  }

  return slots;
}

// The stream buffer is not cleared between updates, so the same delta is
// visible on many consecutive ticks. Only report content we have not already
// seen, and separate stewarding events from routine scoring chatter.
void ReportResultsStream() {
  const size_t size = gLocal.scoring.scoringStreamSize;
  if (size == 0) {
    return;
  }

  std::string current(gLocal.scoring.scoringStream, size);
  if (current == gLastStream) {
    return;
  }
  gLastStream = current;
  gFindings.resultsStreamBytes += size;

  size_t start = 0;
  while (start < current.size()) {
    size_t end = current.find('\n', start);
    if (end == std::string::npos) {
      end = current.size();
    }

    std::string line = current.substr(start, end - start);
    start = end + 1;
    if (line.empty()) {
      continue;
    }

    const bool isStewardEvent =
        line.find("<Incident") != std::string::npos ||
        line.find("<Penalty") != std::string::npos ||
        line.find("<TrackLimit") != std::string::npos;

    if (isStewardEvent) {
      if (gRecentStewardLines.count(line)) {
        ++gFindings.suppressedDuplicates;
        continue;
      }
      if (gRecentStewardLines.size() > 256) {
        gRecentStewardLines.clear();
      }
      gRecentStewardLines.insert(line);

      const bool isMirror = IsMirroredContact(line);
      unsigned long seq = 0;
      if (isMirror) {
        ++gFindings.mirroredContacts;
      } else {
        ++gFindings.stewardEventCount;
        seq = ++gStewardSeq;

        // Only contact events get a context window. Track limits would triple
        // the volume for evidence the element already states outright.
        if (line.find("<Incident") != std::string::npos) {
          const std::string etText = ExtractBetween(line, "et=\"", "\"");
          RegisterIncidentContext(seq,
                                  etText.empty() ? 0.0 : std::strtod(etText.c_str(), nullptr),
                                  ExtractIncidentSlots(line));
        }
      }

      if (gJsonMode) {
        EmitStewardEventJson(line, isMirror, seq);
        continue;
      }

      if (isMirror) {
        std::printf("    ~ (mirror of previous collision) %s\n", line.c_str());
        continue;
      }

      const size_t withPos = line.find(" with ");
      if (withPos != std::string::npos) {
        std::string object = line.substr(withPos + 6);
        const size_t tagPos = object.find('<');
        if (tagPos != std::string::npos) {
          object = object.substr(0, tagPos);
        }
        if (object.rfind("another vehicle", 0) == 0) {
          object = "another vehicle";
        }
        gFindings.incidentObjectKinds.insert(object);
      }

      std::printf("\n*** %s\n", line.c_str());
    } else {
      ++gFindings.scoreLineCount;
      if (!gJsonMode) {
        std::printf("    . %s\n", line.c_str());
      }
    }
  }

  std::fflush(stdout);
}

void TrackSessionState() {
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;

  gFindings.gamePhasesSeen.insert(scoring.mGamePhase);
  gFindings.yellowStatesSeen.insert(scoring.mYellowFlagState);
  gFindings.trackLimitStepsPerPenalty = scoring.mTrackLimitsStepsPerPenalty;
  gFindings.trackLimitStepsPerPoint = scoring.mTrackLimitsStepsPerPoint;

  if (scoring.mNumVehicles > gFindings.maxNumVehicles) {
    gFindings.maxNumVehicles = scoring.mNumVehicles;
  }

  for (long i = 0; i < scoring.mNumVehicles && i < 104; ++i) {
    const VehicleScoringInfoV01& vehicle = gLocal.scoring.vehScoringInfo[i];
    gFindings.flagValuesSeen.insert(vehicle.mFlag);
    if (vehicle.mControl == 2) {
      gFindings.sawRemoteVehicle = true;
    }
  }
}

void ReportRemoteTelemetry() {
  const SharedMemoryTelemetryData& telemetry = gLocal.telemetry;
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;

  if (telemetry.activeVehicles > gFindings.maxActiveVehicles) {
    gFindings.maxActiveVehicles = telemetry.activeVehicles;
  }

  std::map<long, const VehicleScoringInfoV01*> scoringById;
  for (long i = 0; i < scoring.mNumVehicles && i < 104; ++i) {
    scoringById[gLocal.scoring.vehScoringInfo[i].mID] = &gLocal.scoring.vehScoringInfo[i];
  }

  std::printf("\n=== [3] Telemetry population (activeVehicles=%u, mNumVehicles=%ld) ===\n",
              telemetry.activeVehicles, scoring.mNumVehicles);

  int printed = 0;
  for (int i = 0; i < telemetry.activeVehicles && i < 104; ++i) {
    const TelemInfoV01& telem = telemetry.telemInfo[i];
    auto found = scoringById.find(telem.mID);
    const VehicleScoringInfoV01* veh = found == scoringById.end() ? nullptr : found->second;

    const bool inputsAllZero =
        telem.mUnfilteredThrottle == 0.0 &&
        telem.mUnfilteredBrake == 0.0 &&
        telem.mUnfilteredSteering == 0.0;

    const char* control = veh ? ControlLabel(veh->mControl) : "?";
    if (veh && veh->mControl == 2 && !inputsAllZero) {
      gFindings.sawRemoteTelemetryNonZero = true;
    }

    if (printed < 6) {
      std::printf("  id=%-4ld %-12s %-22s thr=%.2f brk=%.2f str=%+.2f lap=%ld%s\n",
                  telem.mID,
                  control,
                  veh ? veh->mDriverName : "(no scoring match)",
                  telem.mUnfilteredThrottle,
                  telem.mUnfilteredBrake,
                  telem.mUnfilteredSteering,
                  telem.mLapNumber,
                  inputsAllZero ? "  <-- ALL ZERO" : "");
      ++printed;
    }
  }

  if (telemetry.activeVehicles == 0) {
    std::printf("  (no telemetry slots populated)\n");
  }
}

// mSession: 0=testday, 1-4=practice, 5-8=qualifying, 9=warmup, 10-13=race.
const char* SessionTypeName(long session) {
  if (session >= 10) {
    return "RACE";
  }
  if (session >= 5) {
    return "QUALIFY";
  }
  if (session >= 1) {
    return "PRACTICE";
  }
  return "PRACTICE";
}

void EmitStatusJson() {
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;
  const bool hasSession = scoring.mNumVehicles > 0 && scoring.mTrackName[0] != '\0';

  // Oversized on purpose: snprintf truncates silently, and a truncated status
  // line is malformed JSON the app discards, so the whole session goes quiet.
  char buffer[2048];
  std::snprintf(
      buffer, sizeof(buffer),
      // session and currentEt exist so the app can derive a session identity
      // that survives a sidecar restart mid-session: now - currentEt
      // reconstructs the session's start instant from any point during it, and
      // the raw mSession separates practice 1-4 / qualifying 5-8 / race 10-13
      // that sessionType flattens into one word.
      "{\"type\":\"status\",\"state\":\"%s\",\"trackName\":\"%s\",\"sessionType\":\"%s\","
      "\"session\":%ld,\"currentEt\":%.3f,"
      "\"driverCount\":%ld,\"timeRemainingSeconds\":%.0f,\"gamePhase\":%u,"
      "\"trackLimitStepsPerPenalty\":%u,\"trackLength\":%.1f,"
      "\"sectorFlags\":[%d,%d,%d],\"etClockDelta\":%.3f,\"bufferedSeconds\":%.1f}",
      hasSession ? "live" : "detached",
      JsonEscape(scoring.mTrackName).c_str(),
      SessionTypeName(scoring.mSession),
      scoring.mSession,
      scoring.mCurrentET,
      scoring.mNumVehicles,
      scoring.mSessionTimeRemaining,
      static_cast<unsigned>(scoring.mGamePhase),
      static_cast<unsigned>(scoring.mTrackLimitsStepsPerPenalty),
      scoring.mLapDist,
      static_cast<int>(scoring.mSectorFlag[0]),
      static_cast<int>(scoring.mSectorFlag[1]),
      static_cast<int>(scoring.mSectorFlag[2]),
      gEtClockDelta,
      BufferedSeconds());
  EmitJson(buffer);
}

void EmitStandingsJson() {
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;

  std::string out = "{\"type\":\"standings\",\"drivers\":[";
  bool first = true;

  for (long i = 0; i < scoring.mNumVehicles && i < 104; ++i) {
    const VehicleScoringInfoV01& v = gLocal.scoring.vehScoringInfo[i];

    // Speed from the scoring struct's own velocity, in vehicle-local
    // coordinates, so its magnitude is the speed regardless of heading.
    const TelemVect3& vel = v.mLocalVel;
    const double speedMps =
        std::sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

    // lapDist and speed exist so the app can derive true on-track gaps between
    // adjacent cars. Classification order cannot serve for that: practice and
    // qualifying rank by best lap time, so consecutive places are not
    // neighbours on track, and mTimeBehindLeader is meaningless there.
    char entry[896];
    std::snprintf(
        entry, sizeof(entry),
        "%s{\"slotId\":%ld,\"steamId\":\"%llu\",\"driverName\":\"%s\","
        "\"vehicleName\":\"%s\",\"vehicleClass\":\"%s\",\"place\":%u,"
        "\"lapsCompleted\":%d,\"lastLapTime\":%.3f,\"timeBehindLeader\":%.3f,"
        "\"lapsBehindLeader\":%ld,\"penalties\":%d,\"inPits\":%s,"
        "\"control\":%d,\"flag\":%u,\"pitStops\":%d,\"finishStatus\":%d,"
        "\"lapDist\":%.1f,\"speedKph\":%.1f}",
        first ? "" : ",", v.mID,
        static_cast<unsigned long long>(v.mSteamID),
        JsonEscape(v.mDriverName).c_str(),
        JsonEscape(v.mVehicleName).c_str(),
        JsonEscape(v.mVehicleClass).c_str(),
        static_cast<unsigned>(v.mPlace), static_cast<int>(v.mTotalLaps),
        v.mLastLapTime, v.mTimeBehindLeader, v.mLapsBehindLeader,
        static_cast<int>(v.mNumPenalties), v.mInPits ? "true" : "false",
        static_cast<int>(v.mControl), static_cast<unsigned>(v.mFlag),
        static_cast<int>(v.mNumPitstops), static_cast<int>(v.mFinishStatus),
        v.mLapDist, speedMps * 3.6);

    out += entry;
    first = false;
  }

  out += "]}";
  EmitJson(out);
}

void EmitStewardEventJson(const std::string& line, bool isMirror, unsigned long seq) {
  const std::string etText = ExtractBetween(line, "et=\"", "\"");

  std::string kind = "incident";
  if (line.find("<TrackLimits") != std::string::npos) {
    kind = "track-limits";
  } else if (line.find("<Penalty") != std::string::npos) {
    kind = "penalty";
  }

  char buffer[4096];
  std::snprintf(buffer, sizeof(buffer),
                "{\"type\":\"steward_event\",\"seq\":%lu,\"kind\":\"%s\",\"et\":%s,"
                "\"mirror\":%s,\"raw\":\"%s\"}",
                seq, kind.c_str(), etText.empty() ? "null" : etText.c_str(),
                isMirror ? "true" : "false", JsonEscape(line).c_str());
  EmitJson(buffer);
}

void ReportDiagnostics() {
  const ScoringInfoV01& scoring = gLocal.scoring.scoringInfo;

  std::printf("\n========================================================\n");
  std::printf("track=%s  session=%ld  phase=%u  vehicles=%ld  remaining=%.0fs\n",
              scoring.mTrackName, scoring.mSession, scoring.mGamePhase,
              scoring.mNumVehicles, scoring.mSessionTimeRemaining);

  std::printf("\n=== [5] Track limits ===\n");
  std::printf("  mTrackLimitsStepsPerPenalty = %d\n", gFindings.trackLimitStepsPerPenalty);
  std::printf("  mTrackLimitsStepsPerPoint   = %d\n", gFindings.trackLimitStepsPerPoint);

  std::printf("\n=== [4] mFlag values observed ===\n  ");
  for (int value : gFindings.flagValuesSeen) {
    std::printf("%d ", value);
  }
  std::printf("\n  (header claims 0=green, 6=blue — confirm by trailing a car until blue shows)\n");

  std::printf("\n=== [6] Game phase / yellow state observed ===\n  phases: ");
  for (int value : gFindings.gamePhasesSeen) {
    std::printf("%d ", value);
  }
  std::printf("\n  yellowFlagState: ");
  for (int value : gFindings.yellowStatesSeen) {
    std::printf("%d ", value);
  }
  std::printf("\n  (expect no FCY transitions — phase 6 would contradict current assumption)\n");

  ReportRemoteTelemetry();
}

void ReportSummary() {
  std::printf("\n\n############ PHASE 0 SUMMARY ############\n");
  std::printf("[1] EAC          : %s\n",
              gFindings.sawScoring
                  ? "PASS — read succeeded while the game was running"
                  : "INCONCLUSIVE — no scoring data observed");
  std::printf("[2] Plugins gate : %s\n",
              gFindings.sawMapping ? "mapping opened" : "mapping NOT found");
  std::printf("[3] Remote telem : ");
  if (!gFindings.sawRemoteVehicle) {
    std::printf("INCONCLUSIVE — no remote (mControl==2) vehicles seen.\n");
    std::printf("                 Single player cannot answer this. Run an ONLINE race.\n");
  } else if (gFindings.sawRemoteTelemetryNonZero) {
    std::printf("PASS — remote cars reported non-zero inputs.\n");
    std::printf("                 Throttle/brake traces are viable. Resequence Tier 1.\n");
  } else {
    std::printf("FAIL — remote cars present but inputs always zero.\n");
    std::printf("                 Drop trace evidence; scoring data still carries Tier 1.\n");
  }
  std::printf("[4] mFlag values : %zu distinct observed\n", gFindings.flagValuesSeen.size());
  std::printf("[5] Track limits : stepsPerPenalty=%d stepsPerPoint=%d\n",
              gFindings.trackLimitStepsPerPenalty, gFindings.trackLimitStepsPerPoint);
  std::printf("[6] FCY          : %zu phase value(s), %zu yellow state(s) seen\n",
              gFindings.gamePhasesSeen.size(), gFindings.yellowStatesSeen.size());
  std::printf("[7] Layout       : gameVersion=%ld, struct=%zu bytes\n",
              gFindings.gameVersion, sizeof(SharedMemoryObjectOut));
  std::printf("\nresults stream: %llu bytes, %lu steward event(s), %lu score line(s)\n",
              gFindings.resultsStreamBytes, gFindings.stewardEventCount,
              gFindings.scoreLineCount);

  std::printf("event types fired: ");
  for (int value : gFindings.eventTypesSeen) {
    std::printf("%s ", EventName(value));
  }
  std::printf("\nstream hygiene: %lu duplicate line(s) suppressed, %lu mirrored collision(s) folded\n",
              gFindings.suppressedDuplicates, gFindings.mirroredContacts);
  std::printf("lock: %lu tick(s) processed, %lu skipped while contended\n",
              gFindings.processedTicks, gFindings.skippedContendedTicks);
  std::printf("context: %lu window(s) captured, %.1fs buffered at exit, clock delta %.3fs\n",
              gFindings.contextsEmitted, BufferedSeconds(),
              gEtClockDelta);
  std::printf("incident object kinds: ");
  for (const std::string& kind : gFindings.incidentObjectKinds) {
    std::printf("[%s] ", kind.c_str());
  }
  std::printf("\n");
  DumpEventsArray("final");
  std::printf("max activeVehicles=%d, max mNumVehicles=%d\n",
              gFindings.maxActiveVehicles, gFindings.maxNumVehicles);
  std::printf("#########################################\n");
}

}  // namespace

int main(int argc, char* argv[]) {
  // Driver names arrive as UTF-8 and are the join key for incident parsing.
  // Without this the console renders them in the OEM code page and accented
  // names are corrupted.
  SetConsoleOutputCP(CP_UTF8);

  DWORD pidArg = 0;
  for (int i = 1; i < argc; ++i) {
    if (std::strcmp(argv[i], "--json") == 0) {
      gJsonMode = true;
    } else {
      pidArg = static_cast<DWORD>(std::strtoul(argv[i], nullptr, 10));
    }
  }

  if (!gJsonMode) {
    std::printf("LMU Steward - live capture sidecar (diagnostic mode)\n");
    ReportLayout();
  }

  DWORD pid = pidArg != 0 ? pidArg : FindProcessId(kProcessName);
  if (pid == 0) {
    if (gJsonMode) {
      EmitJson("{\"type\":\"status\",\"state\":\"detached\",\"detail\":\"Le Mans Ultimate is not running.\"}");
    } else {
      std::printf("\nLe Mans Ultimate is not running (or pass its PID as argv[1]).\n");
    }
    return 1;
  }
  if (!gJsonMode) {
    std::printf("\nAttached to LMU pid %lu\n", pid);
  }

  if (!InitCooperativeLock()) {
    std::printf("Could not initialise the shared memory lock (err %lu)\n", GetLastError());
    return 1;
  }

  HANDLE process = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) {
    std::printf("OpenProcess failed (err %lu)\n", GetLastError());
    return 1;
  }

  // The event and mapping do not exist while LMU sits at the main menu; they
  // appear once a session loads. Wait rather than failing.
  HANDLE event = nullptr;
  HANDLE mapping = nullptr;
  bool announcedWait = false;

  while (!event || !mapping) {
    if (!event) {
      event = OpenEventA(SYNCHRONIZE, FALSE, LMU_SHARED_MEMORY_EVENT);
    }
    if (!mapping) {
      mapping = OpenFileMappingA(FILE_MAP_ALL_ACCESS, FALSE, LMU_SHARED_MEMORY_FILE);
    }
    if (event && mapping) {
      break;
    }

    if (WaitForSingleObject(process, 0) == WAIT_OBJECT_0) {
      if (gJsonMode) {
        EmitJson("{\"type\":\"status\",\"state\":\"detached\",\"detail\":\"LMU exited.\"}");
      } else {
        std::printf("\nLMU exited before shared memory became available.\n");
      }
      return 1;
    }

    if (!announcedWait) {
      announcedWait = true;
      if (gJsonMode) {
        EmitJson("{\"type\":\"status\",\"state\":\"detached\","
                 "\"detail\":\"Waiting for a session to load.\"}");
      } else {
        std::printf("\nShared memory not published yet. Waiting...\n");
        std::printf("  (it appears once a session loads; if it never does, check\n");
        std::printf("   Settings -> Gameplay -> Enable Plugins and restart LMU)\n");
      }
    }
    Sleep(1000);
  }
  gFindings.sawMapping = true;

  auto* shared = static_cast<SharedMemoryLayout*>(
      MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(SharedMemoryLayout)));
  if (!shared) {
    std::printf("MapViewOfFile failed (err %lu)\n", GetLastError());
    return 1;
  }

  // Allocated once up front: ~10 MB for a 30s window across every slot. The
  // ring never reallocates, so a tick can never stall on the allocator while
  // the game is waiting on the next update.
  gBuffer.resize(kBufferFrames);

  if (!gJsonMode) {
    std::printf("Mapped. Waiting for updates - Ctrl+C to stop and print the summary.\n");
    std::printf("Context buffer: %.0fs window, %d frames, %.1f MB resident.\n",
                kBufferWindowSeconds, kBufferFrames,
                (kBufferFrames * sizeof(BufferFrame)) / (1024.0 * 1024.0));
  }

  HANDLE waitOn[2] = {process, event};
  DWORD lastDiagnostic = GetTickCount();

  for (;;) {
    const DWORD signalled = WaitForMultipleObjects(2, waitOn, FALSE, INFINITE);

    if (signalled == WAIT_OBJECT_0) {
      if (gJsonMode) {
        EmitJson("{\"type\":\"status\",\"state\":\"detached\",\"detail\":\"LMU exited.\"}");
      } else {
        std::printf("\nLMU exited.\n");
      }
      break;
    }
    if (signalled != WAIT_OBJECT_0 + 1) {
      std::printf("\nWait failed (err %lu)\n", GetLastError());
      break;
    }

    if (!TryAcquireLock()) {
      ++gFindings.skippedContendedTicks;
      continue;
    }
    CopyShared(gLocal, shared->data);
    ReleaseLock();

    gFindings.gameVersion = gLocal.generic.gameVersion;

    if (!gDumpedEvents) {
      if (!gJsonMode) {
        DumpEventsArray("first update");
      }
      gDumpedEvents = true;
    }

    ++gFindings.processedTicks;
    gFindings.sawScoring = true;
    gFindings.sawTelemetry = gLocal.telemetry.activeVehicles > 0;

    ProcessEventQueue();

    // Capture before parsing the stream, so the frame nearest an incident that
    // arrives on this tick is already in the buffer when it is anchored.
    CaptureFrame();
    ReportResultsStream();
    TrackSessionState();
    FlushPendingContexts(gLocal.scoring.scoringInfo.mCurrentET);

    // Session transitions are detected from observed state rather than the
    // events array, which does not behave as an edge-triggered flag set.
    const long session = gLocal.scoring.scoringInfo.mSession;
    const unsigned char phase = gLocal.scoring.scoringInfo.mGamePhase;

    if (session != gLastSession) {
      if (!gJsonMode) {
        std::printf("\n>>> session changed: %ld -> %ld\n", gLastSession, session);
      }
      gLastSession = session;
      gLastStream.clear();
      ResetContextBuffer();
      gPending.clear();
    }
    if (phase != gLastGamePhase) {
      if (!gJsonMode) {
        std::printf("\n>>> game phase: %u -> %u\n",
                    static_cast<unsigned>(gLastGamePhase), static_cast<unsigned>(phase));
      }
      gLastGamePhase = phase;
    }

    const DWORD now = GetTickCount();
    const DWORD interval = gJsonMode ? 1000 : kDiagnosticIntervalMs;
    if (now - lastDiagnostic >= interval && gFindings.sawScoring) {
      if (gJsonMode) {
        EmitStatusJson();
        EmitStandingsJson();
      } else {
        ReportDiagnostics();
      }
      lastDiagnostic = now;
    }
  }

  if (!gJsonMode) {
    ReportSummary();
  }

  UnmapViewOfFile(shared);
  CloseHandle(mapping);
  CloseHandle(event);
  CloseHandle(process);
  ShutdownCooperativeLock();
  return 0;
}
