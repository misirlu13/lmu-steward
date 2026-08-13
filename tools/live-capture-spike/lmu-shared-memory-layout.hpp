// LMU Steward — shared memory wire layout.
//
// Declares the byte layout of Le Mans Ultimate's `LMU_Data` file mapping so the
// sidecar can be compiled without a Le Mans Ultimate installation present.
//
// WHY THIS FILE EXISTS
//
// The sidecar used to `#include "SharedMemoryInterface.hpp"` straight out of the
// game's Support/SharedMemoryInterface folder. That gave exact layout for free,
// but it made a game install a *build* input: the header is marked proprietary
// and cannot be committed, so a CI runner could never produce the binary, and
// the whole live-capture feature could not ship. See
// plans/live-capture-investigation.md.
//
// This is the same approach every other third-party LMU tool takes — TinyPedal's
// pyLMUSharedMemory declares the identical layout in Python ctypes. What follows
// is a description of a binary interface, written to interoperate with it. It
// is not a copy of the SDK header: no SDK code, no plugin class hierarchy, no
// helper methods, and the fields the sidecar never reads are reserved blocks.
//
// HOW IT IS KEPT HONEST
//
// Two independent checks, because a silently-wrong offset here would produce
// plausible garbage rather than a crash:
//
//   1. The static_asserts at the foot of this file pin every struct size and a
//      spread of field offsets against the baseline measured on 2026-07-28 by
//      compiling against the real headers. They compile everywhere, CI included.
//
//   2. layout-check.cpp includes *both* this file and the real SDK header and
//      asserts offsetof equality field by field. It needs a game install, so it
//      runs locally only — `build.bat --verify` — and it is the check that
//      actually proves this file correct. Run it after any LMU update.
//
// PACKING IS LOAD-BEARING, AND IT CHANGES HALFWAY DOWN THIS FILE.
//
// The `V01` structs come from InternalsPlugin.hpp, which wraps itself in
// `#pragma pack(push, 4)` — doubles sit on 4-byte boundaries, not 8.
//
// The SharedMemory* wrapper structs do NOT. SharedMemoryInterface.hpp includes
// InternalsPlugin.hpp at its top, so that pack has already been *popped* by the
// time the wrappers are declared, and they get default (8-byte) alignment. The
// difference is observable: `SharedMemoryScoringData::scoringStreamSize` is a
// size_t sitting at 552 rather than 548, because default packing aligns it to 8.
// Pack the whole file at 4 and that field, the vehicle array behind it, and the
// 4 bytes of tail padding on SharedMemoryObjectOut all move.
//
// The `#pragma pack(pop)` below is therefore positioned deliberately. Do not
// move it to the foot of the file.

#pragma once

#include <cstddef>
#include <cstdint>

#pragma pack(push, 4)

// The SDK spells this HWND. Kept pointer-width and opaque so this header does
// not drag in windows.h.
using LmuWindowHandle = void*;

struct TelemVect3 {
  double x, y, z;
};

struct TelemWheelV01 {
  double mSuspensionDeflection;   // meters
  double mRideHeight;             // meters
  double mSuspForce;              // pushrod load, Newtons
  double mBrakeTemp;              // Celsius
  double mBrakePressure;          // 0.0-1.0

  double mRotation;               // radians/sec
  double mLateralPatchVel;
  double mLongitudinalPatchVel;
  double mLateralGroundVel;
  double mLongitudinalGroundVel;
  double mCamber;                 // radians
  double mLateralForce;           // Newtons
  double mLongitudinalForce;      // Newtons
  double mTireLoad;               // Newtons

  double mGripFract;
  double mPressure;               // kPa
  double mTemperature[3];         // Kelvin, left/center/right
  double mWear;                   // 0.0-1.0
  char mTerrainName[16];
  unsigned char mSurfaceType;
  bool mFlat;
  bool mDetached;
  unsigned char mStaticUndeflectedRadius;  // centimeters

  double mVerticalTireDeflection;
  double mWheelYLocation;
  double mToe;

  double mTireCarcassTemperature;         // Kelvin
  double mTireInnerLayerTemperature[3];   // Kelvin

  float mOptimalTemp;
  unsigned char mCompoundIndex;
  unsigned char mCompoundType;
  unsigned char mExpansion[18];
};

// World coordinates are left-handed with +y up. Vehicle-local is +x out the
// left side, +y out the roof, +z out the back. The rows of mOri rotate a
// local vector into world space, which is what the sidecar uses it for.
struct TelemInfoV01 {
  // Time
  long mID;                       // slot id; reused after a driver leaves
  double mDeltaTime;
  double mElapsedTime;
  long mLapNumber;
  double mLapStartET;
  char mVehicleName[64];
  char mTrackName[64];

  // Position and derivatives
  TelemVect3 mPos;                // world position, meters
  TelemVect3 mLocalVel;           // vehicle-local velocity, m/s
  TelemVect3 mLocalAccel;

  // Orientation and derivatives
  TelemVect3 mOri[3];             // rows of the orientation matrix
  TelemVect3 mLocalRot;           // vehicle-local rotation, rad/s
  TelemVect3 mLocalRotAccel;

  // Vehicle status
  long mGear;                     // -1 reverse, 0 neutral, 1+ forward
  double mEngineRPM;
  double mEngineWaterTemp;
  double mEngineOilTemp;
  double mClutchRPM;

  // Driver input, unfiltered. The incident dossier's trace evidence.
  double mUnfilteredThrottle;     // 0.0-1.0
  double mUnfilteredBrake;        // 0.0-1.0
  double mUnfilteredSteering;     // -1.0-1.0
  double mUnfilteredClutch;       // 0.0-1.0

  // Driver input after rev limiting, TC, speed-sensitive steering and the rest.
  double mFilteredThrottle;
  double mFilteredBrake;
  double mFilteredSteering;
  double mFilteredClutch;

  double mSteeringShaftTorque;
  double mFront3rdDeflection;
  double mRear3rdDeflection;

  // Aerodynamics
  double mFrontWingHeight;
  double mFrontRideHeight;
  double mRearRideHeight;
  double mDrag;
  double mFrontDownforce;
  double mRearDownforce;

  // State and damage
  double mFuel;                   // liters
  double mEngineMaxRPM;
  unsigned char mScheduledStops;
  bool mOverheating;
  bool mDetached;
  bool mHeadlights;
  unsigned char mDentSeverity[8]; // 0 none, 1 some, 2 more, at 8 locations
  double mLastImpactET;
  double mLastImpactMagnitude;
  TelemVect3 mLastImpactPos;

  double mEngineTorque;
  long mCurrentSector;            // zero-based, pitlane in the sign bit
  unsigned char mSpeedLimiter;
  unsigned char mMaxGears;
  unsigned char mFrontTireCompoundIndex;
  unsigned char mRearTireCompoundIndex;
  double mFuelCapacity;
  unsigned char mFrontFlapActivated;
  unsigned char mRearFlapActivated;
  unsigned char mRearFlapLegalStatus;
  unsigned char mIgnitionStarter;

  char mFrontTireCompoundName[18];
  char mRearTireCompoundName[18];

  unsigned char mSpeedLimiterAvailable;
  unsigned char mAntiStallActivated;
  unsigned char mUnused[2];
  float mVisualSteeringWheelRange;

  double mRearBrakeBias;
  double mTurboBoostPressure;
  float mPhysicsToGraphicsOffset[3];
  float mPhysicalSteeringWheelRange;

  double mDeltaBest;
  double mBatteryChargeFraction;  // 0.0-1.0

  // Electric boost motor
  double mElectricBoostMotorTorque;
  double mElectricBoostMotorRPM;
  double mElectricBoostMotorTemperature;
  double mElectricBoostWaterTemperature;
  unsigned char mElectricBoostMotorState;

  bool mLapInvalidated;
  bool mABSActive;
  bool mTCActive;
  bool mSpeedLimiterActive;
  uint8_t mWiperState;
  uint8_t mTC;
  uint8_t mTCMax;
  uint8_t mTCSlip;
  uint8_t mTCSlipMax;
  uint8_t mTCCut;
  uint8_t mTCCutMax;
  uint8_t mABS;
  uint8_t mABSMax;
  uint8_t mMotorMap;
  uint8_t mMotorMapMax;
  uint8_t mMigration;
  uint8_t mMigrationMax;
  uint8_t mFrontAntiSway;
  uint8_t mFrontAntiSwayMax;
  uint8_t mRearAntiSway;
  uint8_t mRearAntiSwayMax;
  uint8_t mLiftAndCoastProgress;
  uint8_t mTrackLimitsSteps;      // normalized: points * mTrackLimitsStepsPerPoint
  float mRegen;                   // kW
  float mSoC;
  float mVirtualEnergy;
  float mTimeGapCarAhead;
  float mTimeGapCarBehind;
  float mTimeGapPlaceAhead;
  float mTimeGapPlaceBehind;
  char mVehicleModel[30];
  uint8_t mVehicleClass;          // SDK enum IP_VehicleClass
  uint8_t mVehicleChampionship;   // SDK enum IP_VehicleChampionship

  unsigned char mExpansion[20];

  // Deliberately last in the SDK so it can be replaced without moving anything
  // above it. Order is FL, FR, RL, RR.
  TelemWheelV01 mWheel[4];
};

struct VehicleScoringInfoV01 {
  long mID;                       // slot id; reused after a driver leaves
  char mDriverName[32];           // UTF-8, not ASCII
  char mVehicleName[64];
  short mTotalLaps;
  signed char mSector;            // 0 = sector 3, 1 = sector 1, 2 = sector 2
  signed char mFinishStatus;      // 0 none, 1 finished, 2 dnf, 3 dq
  double mLapDist;
  double mPathLateral;            // w.r.t. an approximate center path
  double mTrackEdge;              // same side of track as the vehicle

  double mBestSector1;
  double mBestSector2;            // cumulative: includes sector 1
  double mBestLapTime;
  double mLastSector1;
  double mLastSector2;            // cumulative
  double mLastLapTime;
  double mCurSector1;
  double mCurSector2;             // cumulative

  short mNumPitstops;
  short mNumPenalties;
  bool mIsPlayer;

  signed char mControl;           // -1 nobody, 0 local player, 1 AI, 2 remote, 3 replay
  bool mInPits;                   // unreliable for remote vehicles
  unsigned char mPlace;           // 1-based
  char mVehicleClass[32];

  // Dash indicators
  double mTimeBehindNext;
  long mLapsBehindNext;
  double mTimeBehindLeader;
  long mLapsBehindLeader;
  double mLapStartET;

  // Position and derivatives
  TelemVect3 mPos;                // world position, meters
  TelemVect3 mLocalVel;           // vehicle-local velocity, m/s
  TelemVect3 mLocalAccel;

  // Orientation and derivatives
  TelemVect3 mOri[3];             // rows of the orientation matrix
  TelemVect3 mLocalRot;
  TelemVect3 mLocalRotAccel;

  unsigned char mHeadlights;
  unsigned char mPitState;        // 0 none, 1 request, 2 entering, 3 stopped, 4 exiting
  unsigned char mServerScored;
  unsigned char mIndividualPhase; // game phase, plus 9 after formation, 10 under yellow

  long mQualification;            // 1-based, -1 when invalid

  double mTimeIntoLap;
  double mEstimatedLapTime;

  char mPitGroup[24];
  unsigned char mFlag;            // primary flag shown to this vehicle
  bool mUnderYellow;
  unsigned char mCountLapFlag;    // 0 neither, 1 lap only, 2 lap and time
  bool mInGarageStall;

  unsigned char mUpgradePack[16];
  float mPitLapDist;

  float mBestLapSector1;          // sector 1 of the best lap, not the best sector 1
  float mBestLapSector2;

  unsigned long long mSteamID;

  char mVehFilename[32];

  short mAttackMode;
  unsigned char mFuelFraction;    // 0x00 = 0%, 0xFF = 100%
  bool mDRSState;

  unsigned char mExpansion[4];
};

struct ScoringInfoV01 {
  char mTrackName[64];
  long mSession;                  // 0 test, 1-4 practice, 5-8 qual, 9 warmup, 10-13 race
  double mCurrentET;
  double mEndET;
  long mMaxLaps;
  double mLapDist;

  // Newline-delimited, NUL-terminated additions since the last update. This is
  // the results stream the incident parser reads.
  //
  // A pointer into the *writing* process's address space, so it is meaningless
  // here. Read the bytes out of SharedMemoryScoringData::scoringStream instead;
  // the sidecar's snapshot rebases onto that.
  char* mResultsStream;

  long mNumVehicles;

  // Game phases: 0 before session, 1 recon laps, 2 grid walk, 3 formation,
  // 4 countdown, 5 green, 6 full course yellow, 7 stopped, 8 over, 9 paused.
  unsigned char mGamePhase;

  // Yellow flag state, full course only: -1 invalid, 0 none, 1 pending,
  // 2 pits closed, 3 pit lead lap, 4 pits open, 5 last lap, 6 resume, 7 halt.
  signed char mYellowFlagState;

  signed char mSectorFlag[3];     // local yellows, per sector
  unsigned char mStartLight;
  unsigned char mNumRedLights;
  bool mInRealtime;               // on track as opposed to at the monitor
  char mPlayerName[32];
  char mPlrFileName[64];

  // Weather
  double mDarkCloud;              // 0.0-1.0
  double mRaining;                // 0.0-1.0
  double mAmbientTemp;            // Celsius
  double mTrackTemp;              // Celsius
  TelemVect3 mWind;
  double mMinPathWetness;         // 0.0-1.0
  double mMaxPathWetness;         // 0.0-1.0

  // Multiplayer
  unsigned char mGameMode;        // 1 server, 2 client, 3 both
  bool mIsPasswordProtected;
  unsigned short mServerPort;
  unsigned long mServerPublicIP;
  long mMaxPlayers;
  char mServerName[32];
  float mStartET;                 // seconds since midnight, a time of day

  double mAvgPathWetness;         // 0.0-1.0
  float mSessionTimeRemaining;
  float mTimeOfDay;
  bool mIsFixedSetup;
  uint8_t mTrackGripLevel;
  uint8_t mCloudCoverage;
  uint8_t mTrackLimitsStepsPerPenalty;
  uint8_t mTrackLimitsStepsPerPoint;

  unsigned char mExpansion[187];

  // Deliberately last in the SDK so it can be replaced without moving anything
  // above it. Same foreign-address-space caveat as mResultsStream: the entries
  // live in SharedMemoryScoringData::vehScoringInfo.
  VehicleScoringInfoV01* mVehicle;
};

struct ApplicationStateV01 {
  LmuWindowHandle mAppWindow;
  unsigned long mWidth;
  unsigned long mHeight;
  unsigned long mRefreshRate;
  unsigned long mWindowed;
  unsigned char mOptionsLocation;  // 0 main UI, 1 track loading, 2 monitor, 3 on track
  char mOptionsPage[31];
  unsigned char mExpansion[204];
};

// End of the 4-packed region — everything above mirrors InternalsPlugin.hpp.
// Everything below mirrors SharedMemoryInterface.hpp, which is declared after
// that header's pack has been popped. See the packing note at the top.
#pragma pack(pop)

// ---------------------------------------------------------------------------
// The mapping itself.
//
// Named `LMU_Data`, guarded by the `LMU_Data_Event` auto-reset event and the
// `LMU_SharedMemoryLockData` spinlock. The sidecar implements its own bounded
// try-acquire against that lock rather than the SDK's — see the comment above
// InitCooperativeLock in main.cpp for why the SDK's slow path is unsafe.
// ---------------------------------------------------------------------------

#define LMU_SHARED_MEMORY_FILE "LMU_Data"
#define LMU_SHARED_MEMORY_EVENT "LMU_Data_Event"
#define LMU_SHARED_MEMORY_LOCK_DATA "LMU_SharedMemoryLockData"
#define LMU_SHARED_MEMORY_LOCK_EVENT "LMU_SharedMemoryLockEvent"

// Index into SharedMemoryGeneric::events. A non-zero entry means that callback
// fired since the last publish, which is how the writer signals what part of
// the buffer is fresh.
enum SharedMemoryEvent : uint32_t {
  SME_ENTER,
  SME_EXIT,
  SME_STARTUP,
  SME_SHUTDOWN,
  SME_LOAD,
  SME_UNLOAD,
  SME_START_SESSION,
  SME_END_SESSION,
  SME_ENTER_REALTIME,
  SME_EXIT_REALTIME,
  SME_UPDATE_SCORING,
  SME_UPDATE_TELEMETRY,
  SME_INIT_APPLICATION,
  SME_UNINIT_APPLICATION,
  SME_SET_ENVIRONMENT,
  SME_FFB,
  SME_MAX
};

// 104 is the SDK's ceiling, not the grid size. Only the first mNumVehicles /
// activeVehicles entries carry anything.
constexpr int kLmuMaxVehicles = 104;
constexpr int kLmuResultsStreamBytes = 65536;
constexpr int kLmuMaxPath = 260;  // Windows MAX_PATH

struct SharedMemoryScoringData {
  ScoringInfoV01 scoringInfo;
  size_t scoringStreamSize;
  VehicleScoringInfoV01 vehScoringInfo[kLmuMaxVehicles];
  char scoringStream[kLmuResultsStreamBytes];
};

struct SharedMemoryTelemetryData {
  uint8_t activeVehicles;
  uint8_t playerVehicleIdx;
  bool playerHasVehicle;
  TelemInfoV01 telemInfo[kLmuMaxVehicles];
};

struct SharedMemoryPathData {
  char userData[kLmuMaxPath];
  char customVariables[kLmuMaxPath];
  char stewardResults[kLmuMaxPath];
  char playerProfile[kLmuMaxPath];
  char pluginsFolder[kLmuMaxPath];
};

struct SharedMemoryGeneric {
  SharedMemoryEvent events[SharedMemoryEvent::SME_MAX];
  long gameVersion;               // gate layout assumptions on this
  float FFBTorque;
  ApplicationStateV01 appInfo;
};

struct SharedMemoryObjectOut {
  SharedMemoryGeneric generic;
  SharedMemoryPathData paths;
  SharedMemoryScoringData scoring;
  SharedMemoryTelemetryData telemetry;
};

struct SharedMemoryLayout {
  SharedMemoryObjectOut data;
};

// ---------------------------------------------------------------------------
// Layout assertions.
//
// Baseline measured 2026-07-28 by compiling the spike against the shipped SDK
// headers; recorded in plans/live-capture-investigation.md. These are the guard
// rail for CI, where no game install exists to check against.
//
// If one of these fires after an LMU update, do NOT relax the number. Run
// `build.bat --verify` on a machine with the game installed — that reports which
// field actually moved.
// ---------------------------------------------------------------------------

static_assert(sizeof(TelemVect3) == 24, "TelemVect3 layout drifted");
static_assert(sizeof(TelemWheelV01) == 260, "TelemWheelV01 layout drifted");
static_assert(sizeof(TelemInfoV01) == 1888, "TelemInfoV01 layout drifted");
static_assert(sizeof(VehicleScoringInfoV01) == 584,
              "VehicleScoringInfoV01 layout drifted");
static_assert(sizeof(ScoringInfoV01) == 548, "ScoringInfoV01 layout drifted");
static_assert(sizeof(ApplicationStateV01) == 260,
              "ApplicationStateV01 layout drifted");
static_assert(sizeof(SharedMemoryGeneric) == 332,
              "SharedMemoryGeneric layout drifted");
static_assert(sizeof(SharedMemoryPathData) == 1300,
              "SharedMemoryPathData layout drifted");
static_assert(sizeof(SharedMemoryScoringData) == 126832,
              "SharedMemoryScoringData layout drifted");
static_assert(sizeof(SharedMemoryTelemetryData) == 196356,
              "SharedMemoryTelemetryData layout drifted");
static_assert(sizeof(SharedMemoryObjectOut) == 324824,
              "SharedMemoryObjectOut layout drifted");

static_assert(offsetof(SharedMemoryObjectOut, paths) == 332, "paths moved");
static_assert(offsetof(SharedMemoryObjectOut, scoring) == 1632,
              "scoring block moved");
static_assert(offsetof(SharedMemoryObjectOut, telemetry) == 128464,
              "telemetry block moved");
static_assert(offsetof(SharedMemoryGeneric, gameVersion) == 64,
              "gameVersion moved");
static_assert(offsetof(SharedMemoryScoringData, vehScoringInfo) == 560,
              "vehicle array moved");
static_assert(offsetof(SharedMemoryScoringData, scoringStream) == 61296,
              "results stream buffer moved");
static_assert(offsetof(SharedMemoryTelemetryData, telemInfo) == 4,
              "telemetry array moved");

// Spot checks on the fields the sidecar actually reads, chosen to bracket every
// place packing could go wrong: the first double after an odd-sized char array,
// the pointers, and the tail LMU added on top of the rF2 base layout. Measured,
// not derived — three of these were originally miscounted by hand.
static_assert(offsetof(TelemInfoV01, mElapsedTime) == 12,
              "telemetry mElapsedTime moved");
static_assert(offsetof(TelemInfoV01, mPos) == 160, "telemetry mPos moved");
static_assert(offsetof(TelemInfoV01, mOri) == 232, "telemetry mOri moved");
static_assert(offsetof(TelemInfoV01, mLocalRot) == 304,
              "telemetry mLocalRot moved");
static_assert(offsetof(TelemInfoV01, mUnfilteredThrottle) == 388,
              "telemetry driver input moved");
static_assert(offsetof(TelemInfoV01, mExpansion) == 828,
              "telemetry tail moved");
static_assert(offsetof(TelemInfoV01, mWheel) == 848, "wheel block moved");

static_assert(offsetof(VehicleScoringInfoV01, mLapDist) == 104,
              "scoring mLapDist moved");
static_assert(offsetof(VehicleScoringInfoV01, mPos) == 264,
              "scoring mPos moved");
static_assert(offsetof(VehicleScoringInfoV01, mQualification) == 460,
              "scoring mQualification moved");
static_assert(offsetof(VehicleScoringInfoV01, mFlag) == 504,
              "scoring mFlag moved");
static_assert(offsetof(VehicleScoringInfoV01, mSteamID) == 536,
              "scoring mSteamID moved");

static_assert(offsetof(ScoringInfoV01, mResultsStream) == 96,
              "results stream pointer moved");
static_assert(offsetof(ScoringInfoV01, mDarkCloud) == 212,
              "scoring weather block moved");
static_assert(offsetof(ScoringInfoV01, mServerName) == 296,
              "scoring mServerName moved");
static_assert(offsetof(ScoringInfoV01, mSessionTimeRemaining) == 340,
              "scoring mSessionTimeRemaining moved");
static_assert(offsetof(ScoringInfoV01, mTrackLimitsStepsPerPenalty) == 351,
              "track limit steps moved");
static_assert(offsetof(ScoringInfoV01, mVehicle) == 540,
              "vehicle array pointer moved");

// The wrapper structs are default-packed, and these three are what catch a
// mistaken `pack(4)` over the whole file: each moves if the pack region is
// extended past ApplicationStateV01.
static_assert(offsetof(SharedMemoryScoringData, scoringStreamSize) == 552,
              "results stream size moved — check the pack(pop) placement");
static_assert(alignof(SharedMemoryObjectOut) == 8,
              "the mapping wrappers are no longer default-packed");
