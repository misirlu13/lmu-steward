// LMU Steward — Phase 0 live capture spike.
//
// Throwaway diagnostic. Attaches to Le Mans Ultimate's first-party shared
// memory interface and answers the seven open questions in
// docs/live-capture-investigation.md. Never shipped; dev machine only.

#include <optional>
#include <windows.h>
#include <tlhelp32.h>
#include <cstdio>
#include <cstring>
#include <map>
#include <set>
#include <string>

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
};

Findings gFindings;

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
  std::printf("  (record these — a change across LMU updates means the port drifted)\n");
}

void ReportResultsStream() {
  const size_t size = gLocal.scoring.scoringStreamSize;
  if (size == 0) {
    return;
  }

  gFindings.resultsStreamBytes += size;
  std::printf("\n--- results stream (+%zu bytes) ---\n%s", size, gLocal.scoring.scoringStream);
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
  std::printf("\nresults stream total: %llu bytes\n", gFindings.resultsStreamBytes);
  std::printf("max activeVehicles=%d, max mNumVehicles=%d\n",
              gFindings.maxActiveVehicles, gFindings.maxNumVehicles);
  std::printf("#########################################\n");
}

}  // namespace

int main(int argc, char* argv[]) {
  std::printf("LMU Steward — Phase 0 live capture spike\n");
  ReportLayout();

  DWORD pid = argc > 1 ? static_cast<DWORD>(std::strtoul(argv[1], nullptr, 10))
                       : FindProcessId(kProcessName);
  if (pid == 0) {
    std::printf("\nLe Mans Ultimate is not running (or pass its PID as argv[1]).\n");
    return 1;
  }
  std::printf("\nAttached to LMU pid %lu\n", pid);

  auto lock = SharedMemoryLock::MakeSharedMemoryLock();
  if (!lock.has_value()) {
    std::printf("Could not initialise SharedMemoryLock (err %lu)\n", GetLastError());
    return 1;
  }

  HANDLE process = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  HANDLE event = OpenEventA(SYNCHRONIZE, FALSE, LMU_SHARED_MEMORY_EVENT);
  HANDLE mapping = OpenFileMappingA(FILE_MAP_ALL_ACCESS, FALSE, LMU_SHARED_MEMORY_FILE);

  if (!process || !event || !mapping) {
    std::printf("\nFailed to attach (process=%p event=%p mapping=%p, err %lu)\n",
                process, event, mapping, GetLastError());
    std::printf("If the mapping is missing: enable Settings -> Gameplay -> Enable Plugins,\n");
    std::printf("then restart Le Mans Ultimate.\n");
    return 1;
  }
  gFindings.sawMapping = true;

  auto* shared = static_cast<SharedMemoryLayout*>(
      MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeof(SharedMemoryLayout)));
  if (!shared) {
    std::printf("MapViewOfFile failed (err %lu)\n", GetLastError());
    return 1;
  }

  std::printf("Mapped. Waiting for updates — Ctrl+C to stop and print the summary.\n");

  HANDLE waitOn[2] = {process, event};
  DWORD lastDiagnostic = GetTickCount();

  for (;;) {
    const DWORD signalled = WaitForMultipleObjects(2, waitOn, FALSE, INFINITE);

    if (signalled == WAIT_OBJECT_0) {
      std::printf("\nLMU exited.\n");
      break;
    }
    if (signalled != WAIT_OBJECT_0 + 1) {
      std::printf("\nWait failed (err %lu)\n", GetLastError());
      break;
    }

    lock->Lock();
    CopySharedMemoryObj(gLocal, shared->data);
    lock->Unlock();

    gFindings.gameVersion = gLocal.generic.gameVersion;

    if (gLocal.generic.events[SME_UPDATE_SCORING]) {
      gFindings.sawScoring = true;
      ReportResultsStream();
      TrackSessionState();
    }
    if (gLocal.generic.events[SME_UPDATE_TELEMETRY]) {
      gFindings.sawTelemetry = true;
    }
    if (gLocal.generic.events[SME_START_SESSION]) {
      std::printf("\n>>> SME_START_SESSION\n");
    }
    if (gLocal.generic.events[SME_END_SESSION]) {
      std::printf("\n>>> SME_END_SESSION\n");
    }

    const DWORD now = GetTickCount();
    if (now - lastDiagnostic >= kDiagnosticIntervalMs && gFindings.sawScoring) {
      ReportDiagnostics();
      lastDiagnostic = now;
    }
  }

  ReportSummary();

  UnmapViewOfFile(shared);
  CloseHandle(mapping);
  CloseHandle(event);
  CloseHandle(process);
  return 0;
}
