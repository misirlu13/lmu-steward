// LMU Steward — layout cross-check.
//
// Compiles lmu-shared-memory-layout.hpp and Studio 397's SharedMemoryInterface.hpp
// into the same translation unit and asserts, field by field, that they describe
// the same bytes. This is what makes the vendored header trustworthy: the
// static_asserts inside it pin numbers that were measured once, whereas this
// re-derives them from the SDK every time it runs.
//
// It needs a Le Mans Ultimate install, so it is a LOCAL check only — never part
// of the CI build, which is the entire point of vendoring the layout.
//
//     tools\live-capture-spike\build.bat --verify
//
// Run it after every LMU update. A failure here names the field that moved; fix
// lmu-shared-memory-layout.hpp to match, and update the measured baseline in
// docs/live-capture-investigation.md.
//
// Nothing links against this and it ships nowhere. It exists to fail loudly at
// compile time.

// Pulled in at global scope first. Both headers below re-include some of these,
// and their include guards make that a no-op — which is what keeps the standard
// library out of the namespace wrapper.
#include <optional>
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <utility>

// Ours, quarantined so the SDK's identically-named structs can coexist.
namespace vendored {
#include "lmu-shared-memory-layout.hpp"
}  // namespace vendored

// Theirs, at global scope.
#include "SharedMemoryInterface.hpp"

#define SAME_SIZE(S)                                  \
  static_assert(sizeof(vendored::S) == sizeof(::S),   \
                "sizeof(" #S ") disagrees with the SDK header")

#define SAME_OFFSET(S, F)                                         \
  static_assert(offsetof(vendored::S, F) == offsetof(::S, F),     \
                #S "::" #F " sits at a different offset than the SDK header")

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

SAME_SIZE(TelemVect3);
SAME_SIZE(TelemWheelV01);
SAME_SIZE(TelemInfoV01);
SAME_SIZE(VehicleScoringInfoV01);
SAME_SIZE(ScoringInfoV01);
SAME_SIZE(ApplicationStateV01);
SAME_SIZE(SharedMemoryGeneric);
SAME_SIZE(SharedMemoryPathData);
SAME_SIZE(SharedMemoryScoringData);
SAME_SIZE(SharedMemoryTelemetryData);
SAME_SIZE(SharedMemoryObjectOut);
SAME_SIZE(SharedMemoryLayout);

// ---------------------------------------------------------------------------
// TelemVect3
//
// The SDK wraps x/y/z in a union with a double[3] so it can be indexed. Ours
// declares the three members plainly — the sidecar only ever reads .x/.y/.z —
// which is layout-identical but worth asserting rather than assuming.
// ---------------------------------------------------------------------------

SAME_OFFSET(TelemVect3, x);
SAME_OFFSET(TelemVect3, y);
SAME_OFFSET(TelemVect3, z);

// ---------------------------------------------------------------------------
// TelemWheelV01
// ---------------------------------------------------------------------------

SAME_OFFSET(TelemWheelV01, mSuspensionDeflection);
SAME_OFFSET(TelemWheelV01, mRideHeight);
SAME_OFFSET(TelemWheelV01, mSuspForce);
SAME_OFFSET(TelemWheelV01, mBrakeTemp);
SAME_OFFSET(TelemWheelV01, mBrakePressure);
SAME_OFFSET(TelemWheelV01, mRotation);
SAME_OFFSET(TelemWheelV01, mLateralPatchVel);
SAME_OFFSET(TelemWheelV01, mLongitudinalPatchVel);
SAME_OFFSET(TelemWheelV01, mLateralGroundVel);
SAME_OFFSET(TelemWheelV01, mLongitudinalGroundVel);
SAME_OFFSET(TelemWheelV01, mCamber);
SAME_OFFSET(TelemWheelV01, mLateralForce);
SAME_OFFSET(TelemWheelV01, mLongitudinalForce);
SAME_OFFSET(TelemWheelV01, mTireLoad);
SAME_OFFSET(TelemWheelV01, mGripFract);
SAME_OFFSET(TelemWheelV01, mPressure);
SAME_OFFSET(TelemWheelV01, mTemperature);
SAME_OFFSET(TelemWheelV01, mWear);
SAME_OFFSET(TelemWheelV01, mTerrainName);
SAME_OFFSET(TelemWheelV01, mSurfaceType);
SAME_OFFSET(TelemWheelV01, mFlat);
SAME_OFFSET(TelemWheelV01, mDetached);
SAME_OFFSET(TelemWheelV01, mStaticUndeflectedRadius);
SAME_OFFSET(TelemWheelV01, mVerticalTireDeflection);
SAME_OFFSET(TelemWheelV01, mWheelYLocation);
SAME_OFFSET(TelemWheelV01, mToe);
SAME_OFFSET(TelemWheelV01, mTireCarcassTemperature);
SAME_OFFSET(TelemWheelV01, mTireInnerLayerTemperature);
SAME_OFFSET(TelemWheelV01, mOptimalTemp);
SAME_OFFSET(TelemWheelV01, mCompoundIndex);
SAME_OFFSET(TelemWheelV01, mCompoundType);
SAME_OFFSET(TelemWheelV01, mExpansion);

// ---------------------------------------------------------------------------
// TelemInfoV01
// ---------------------------------------------------------------------------

SAME_OFFSET(TelemInfoV01, mID);
SAME_OFFSET(TelemInfoV01, mDeltaTime);
SAME_OFFSET(TelemInfoV01, mElapsedTime);
SAME_OFFSET(TelemInfoV01, mLapNumber);
SAME_OFFSET(TelemInfoV01, mLapStartET);
SAME_OFFSET(TelemInfoV01, mVehicleName);
SAME_OFFSET(TelemInfoV01, mTrackName);
SAME_OFFSET(TelemInfoV01, mPos);
SAME_OFFSET(TelemInfoV01, mLocalVel);
SAME_OFFSET(TelemInfoV01, mLocalAccel);
SAME_OFFSET(TelemInfoV01, mOri);
SAME_OFFSET(TelemInfoV01, mLocalRot);
SAME_OFFSET(TelemInfoV01, mLocalRotAccel);
SAME_OFFSET(TelemInfoV01, mGear);
SAME_OFFSET(TelemInfoV01, mEngineRPM);
SAME_OFFSET(TelemInfoV01, mEngineWaterTemp);
SAME_OFFSET(TelemInfoV01, mEngineOilTemp);
SAME_OFFSET(TelemInfoV01, mClutchRPM);
SAME_OFFSET(TelemInfoV01, mUnfilteredThrottle);
SAME_OFFSET(TelemInfoV01, mUnfilteredBrake);
SAME_OFFSET(TelemInfoV01, mUnfilteredSteering);
SAME_OFFSET(TelemInfoV01, mUnfilteredClutch);
SAME_OFFSET(TelemInfoV01, mFilteredThrottle);
SAME_OFFSET(TelemInfoV01, mFilteredBrake);
SAME_OFFSET(TelemInfoV01, mFilteredSteering);
SAME_OFFSET(TelemInfoV01, mFilteredClutch);
SAME_OFFSET(TelemInfoV01, mSteeringShaftTorque);
SAME_OFFSET(TelemInfoV01, mFront3rdDeflection);
SAME_OFFSET(TelemInfoV01, mRear3rdDeflection);
SAME_OFFSET(TelemInfoV01, mFrontWingHeight);
SAME_OFFSET(TelemInfoV01, mFrontRideHeight);
SAME_OFFSET(TelemInfoV01, mRearRideHeight);
SAME_OFFSET(TelemInfoV01, mDrag);
SAME_OFFSET(TelemInfoV01, mFrontDownforce);
SAME_OFFSET(TelemInfoV01, mRearDownforce);
SAME_OFFSET(TelemInfoV01, mFuel);
SAME_OFFSET(TelemInfoV01, mEngineMaxRPM);
SAME_OFFSET(TelemInfoV01, mScheduledStops);
SAME_OFFSET(TelemInfoV01, mOverheating);
SAME_OFFSET(TelemInfoV01, mDetached);
SAME_OFFSET(TelemInfoV01, mHeadlights);
SAME_OFFSET(TelemInfoV01, mDentSeverity);
SAME_OFFSET(TelemInfoV01, mLastImpactET);
SAME_OFFSET(TelemInfoV01, mLastImpactMagnitude);
SAME_OFFSET(TelemInfoV01, mLastImpactPos);
SAME_OFFSET(TelemInfoV01, mEngineTorque);
SAME_OFFSET(TelemInfoV01, mCurrentSector);
SAME_OFFSET(TelemInfoV01, mSpeedLimiter);
SAME_OFFSET(TelemInfoV01, mMaxGears);
SAME_OFFSET(TelemInfoV01, mFrontTireCompoundIndex);
SAME_OFFSET(TelemInfoV01, mRearTireCompoundIndex);
SAME_OFFSET(TelemInfoV01, mFuelCapacity);
SAME_OFFSET(TelemInfoV01, mFrontFlapActivated);
SAME_OFFSET(TelemInfoV01, mRearFlapActivated);
SAME_OFFSET(TelemInfoV01, mRearFlapLegalStatus);
SAME_OFFSET(TelemInfoV01, mIgnitionStarter);
SAME_OFFSET(TelemInfoV01, mFrontTireCompoundName);
SAME_OFFSET(TelemInfoV01, mRearTireCompoundName);
SAME_OFFSET(TelemInfoV01, mSpeedLimiterAvailable);
SAME_OFFSET(TelemInfoV01, mAntiStallActivated);
SAME_OFFSET(TelemInfoV01, mUnused);
SAME_OFFSET(TelemInfoV01, mVisualSteeringWheelRange);
SAME_OFFSET(TelemInfoV01, mRearBrakeBias);
SAME_OFFSET(TelemInfoV01, mTurboBoostPressure);
SAME_OFFSET(TelemInfoV01, mPhysicsToGraphicsOffset);
SAME_OFFSET(TelemInfoV01, mPhysicalSteeringWheelRange);
SAME_OFFSET(TelemInfoV01, mDeltaBest);
SAME_OFFSET(TelemInfoV01, mBatteryChargeFraction);
SAME_OFFSET(TelemInfoV01, mElectricBoostMotorTorque);
SAME_OFFSET(TelemInfoV01, mElectricBoostMotorRPM);
SAME_OFFSET(TelemInfoV01, mElectricBoostMotorTemperature);
SAME_OFFSET(TelemInfoV01, mElectricBoostWaterTemperature);
SAME_OFFSET(TelemInfoV01, mElectricBoostMotorState);
SAME_OFFSET(TelemInfoV01, mLapInvalidated);
SAME_OFFSET(TelemInfoV01, mABSActive);
SAME_OFFSET(TelemInfoV01, mTCActive);
SAME_OFFSET(TelemInfoV01, mSpeedLimiterActive);
SAME_OFFSET(TelemInfoV01, mWiperState);
SAME_OFFSET(TelemInfoV01, mTC);
SAME_OFFSET(TelemInfoV01, mTCMax);
SAME_OFFSET(TelemInfoV01, mTCSlip);
SAME_OFFSET(TelemInfoV01, mTCSlipMax);
SAME_OFFSET(TelemInfoV01, mTCCut);
SAME_OFFSET(TelemInfoV01, mTCCutMax);
SAME_OFFSET(TelemInfoV01, mABS);
SAME_OFFSET(TelemInfoV01, mABSMax);
SAME_OFFSET(TelemInfoV01, mMotorMap);
SAME_OFFSET(TelemInfoV01, mMotorMapMax);
SAME_OFFSET(TelemInfoV01, mMigration);
SAME_OFFSET(TelemInfoV01, mMigrationMax);
SAME_OFFSET(TelemInfoV01, mFrontAntiSway);
SAME_OFFSET(TelemInfoV01, mFrontAntiSwayMax);
SAME_OFFSET(TelemInfoV01, mRearAntiSway);
SAME_OFFSET(TelemInfoV01, mRearAntiSwayMax);
SAME_OFFSET(TelemInfoV01, mLiftAndCoastProgress);
SAME_OFFSET(TelemInfoV01, mTrackLimitsSteps);
SAME_OFFSET(TelemInfoV01, mRegen);
SAME_OFFSET(TelemInfoV01, mSoC);
SAME_OFFSET(TelemInfoV01, mVirtualEnergy);
SAME_OFFSET(TelemInfoV01, mTimeGapCarAhead);
SAME_OFFSET(TelemInfoV01, mTimeGapCarBehind);
SAME_OFFSET(TelemInfoV01, mTimeGapPlaceAhead);
SAME_OFFSET(TelemInfoV01, mTimeGapPlaceBehind);
SAME_OFFSET(TelemInfoV01, mVehicleModel);
// The SDK types these as the IP_VehicleClass / IP_VehicleChampionship enums;
// ours uses their uint8_t underlying type. mExpansion below is what proves the
// substitution did not resize anything.
SAME_OFFSET(TelemInfoV01, mVehicleClass);
SAME_OFFSET(TelemInfoV01, mVehicleChampionship);
SAME_OFFSET(TelemInfoV01, mExpansion);
SAME_OFFSET(TelemInfoV01, mWheel);

// ---------------------------------------------------------------------------
// VehicleScoringInfoV01
// ---------------------------------------------------------------------------

SAME_OFFSET(VehicleScoringInfoV01, mID);
SAME_OFFSET(VehicleScoringInfoV01, mDriverName);
SAME_OFFSET(VehicleScoringInfoV01, mVehicleName);
SAME_OFFSET(VehicleScoringInfoV01, mTotalLaps);
SAME_OFFSET(VehicleScoringInfoV01, mSector);
SAME_OFFSET(VehicleScoringInfoV01, mFinishStatus);
SAME_OFFSET(VehicleScoringInfoV01, mLapDist);
SAME_OFFSET(VehicleScoringInfoV01, mPathLateral);
SAME_OFFSET(VehicleScoringInfoV01, mTrackEdge);
SAME_OFFSET(VehicleScoringInfoV01, mBestSector1);
SAME_OFFSET(VehicleScoringInfoV01, mBestSector2);
SAME_OFFSET(VehicleScoringInfoV01, mBestLapTime);
SAME_OFFSET(VehicleScoringInfoV01, mLastSector1);
SAME_OFFSET(VehicleScoringInfoV01, mLastSector2);
SAME_OFFSET(VehicleScoringInfoV01, mLastLapTime);
SAME_OFFSET(VehicleScoringInfoV01, mCurSector1);
SAME_OFFSET(VehicleScoringInfoV01, mCurSector2);
SAME_OFFSET(VehicleScoringInfoV01, mNumPitstops);
SAME_OFFSET(VehicleScoringInfoV01, mNumPenalties);
SAME_OFFSET(VehicleScoringInfoV01, mIsPlayer);
SAME_OFFSET(VehicleScoringInfoV01, mControl);
SAME_OFFSET(VehicleScoringInfoV01, mInPits);
SAME_OFFSET(VehicleScoringInfoV01, mPlace);
SAME_OFFSET(VehicleScoringInfoV01, mVehicleClass);
SAME_OFFSET(VehicleScoringInfoV01, mTimeBehindNext);
SAME_OFFSET(VehicleScoringInfoV01, mLapsBehindNext);
SAME_OFFSET(VehicleScoringInfoV01, mTimeBehindLeader);
SAME_OFFSET(VehicleScoringInfoV01, mLapsBehindLeader);
SAME_OFFSET(VehicleScoringInfoV01, mLapStartET);
SAME_OFFSET(VehicleScoringInfoV01, mPos);
SAME_OFFSET(VehicleScoringInfoV01, mLocalVel);
SAME_OFFSET(VehicleScoringInfoV01, mLocalAccel);
SAME_OFFSET(VehicleScoringInfoV01, mOri);
SAME_OFFSET(VehicleScoringInfoV01, mLocalRot);
SAME_OFFSET(VehicleScoringInfoV01, mLocalRotAccel);
SAME_OFFSET(VehicleScoringInfoV01, mHeadlights);
SAME_OFFSET(VehicleScoringInfoV01, mPitState);
SAME_OFFSET(VehicleScoringInfoV01, mServerScored);
SAME_OFFSET(VehicleScoringInfoV01, mIndividualPhase);
SAME_OFFSET(VehicleScoringInfoV01, mQualification);
SAME_OFFSET(VehicleScoringInfoV01, mTimeIntoLap);
SAME_OFFSET(VehicleScoringInfoV01, mEstimatedLapTime);
SAME_OFFSET(VehicleScoringInfoV01, mPitGroup);
SAME_OFFSET(VehicleScoringInfoV01, mFlag);
SAME_OFFSET(VehicleScoringInfoV01, mUnderYellow);
SAME_OFFSET(VehicleScoringInfoV01, mCountLapFlag);
SAME_OFFSET(VehicleScoringInfoV01, mInGarageStall);
SAME_OFFSET(VehicleScoringInfoV01, mUpgradePack);
SAME_OFFSET(VehicleScoringInfoV01, mPitLapDist);
SAME_OFFSET(VehicleScoringInfoV01, mBestLapSector1);
SAME_OFFSET(VehicleScoringInfoV01, mBestLapSector2);
SAME_OFFSET(VehicleScoringInfoV01, mSteamID);
SAME_OFFSET(VehicleScoringInfoV01, mVehFilename);
SAME_OFFSET(VehicleScoringInfoV01, mAttackMode);
SAME_OFFSET(VehicleScoringInfoV01, mFuelFraction);
SAME_OFFSET(VehicleScoringInfoV01, mDRSState);
SAME_OFFSET(VehicleScoringInfoV01, mExpansion);

// ---------------------------------------------------------------------------
// ScoringInfoV01
// ---------------------------------------------------------------------------

SAME_OFFSET(ScoringInfoV01, mTrackName);
SAME_OFFSET(ScoringInfoV01, mSession);
SAME_OFFSET(ScoringInfoV01, mCurrentET);
SAME_OFFSET(ScoringInfoV01, mEndET);
SAME_OFFSET(ScoringInfoV01, mMaxLaps);
SAME_OFFSET(ScoringInfoV01, mLapDist);
SAME_OFFSET(ScoringInfoV01, mResultsStream);
SAME_OFFSET(ScoringInfoV01, mNumVehicles);
SAME_OFFSET(ScoringInfoV01, mGamePhase);
SAME_OFFSET(ScoringInfoV01, mYellowFlagState);
SAME_OFFSET(ScoringInfoV01, mSectorFlag);
SAME_OFFSET(ScoringInfoV01, mStartLight);
SAME_OFFSET(ScoringInfoV01, mNumRedLights);
SAME_OFFSET(ScoringInfoV01, mInRealtime);
SAME_OFFSET(ScoringInfoV01, mPlayerName);
SAME_OFFSET(ScoringInfoV01, mPlrFileName);
SAME_OFFSET(ScoringInfoV01, mDarkCloud);
SAME_OFFSET(ScoringInfoV01, mRaining);
SAME_OFFSET(ScoringInfoV01, mAmbientTemp);
SAME_OFFSET(ScoringInfoV01, mTrackTemp);
SAME_OFFSET(ScoringInfoV01, mWind);
SAME_OFFSET(ScoringInfoV01, mMinPathWetness);
SAME_OFFSET(ScoringInfoV01, mMaxPathWetness);
SAME_OFFSET(ScoringInfoV01, mGameMode);
SAME_OFFSET(ScoringInfoV01, mIsPasswordProtected);
SAME_OFFSET(ScoringInfoV01, mServerPort);
SAME_OFFSET(ScoringInfoV01, mServerPublicIP);
SAME_OFFSET(ScoringInfoV01, mMaxPlayers);
SAME_OFFSET(ScoringInfoV01, mServerName);
SAME_OFFSET(ScoringInfoV01, mStartET);
SAME_OFFSET(ScoringInfoV01, mAvgPathWetness);
SAME_OFFSET(ScoringInfoV01, mSessionTimeRemaining);
SAME_OFFSET(ScoringInfoV01, mTimeOfDay);
SAME_OFFSET(ScoringInfoV01, mIsFixedSetup);
SAME_OFFSET(ScoringInfoV01, mTrackGripLevel);
SAME_OFFSET(ScoringInfoV01, mCloudCoverage);
SAME_OFFSET(ScoringInfoV01, mTrackLimitsStepsPerPenalty);
SAME_OFFSET(ScoringInfoV01, mTrackLimitsStepsPerPoint);
SAME_OFFSET(ScoringInfoV01, mExpansion);
SAME_OFFSET(ScoringInfoV01, mVehicle);

// ---------------------------------------------------------------------------
// ApplicationStateV01
// ---------------------------------------------------------------------------

SAME_OFFSET(ApplicationStateV01, mAppWindow);
SAME_OFFSET(ApplicationStateV01, mWidth);
SAME_OFFSET(ApplicationStateV01, mHeight);
SAME_OFFSET(ApplicationStateV01, mRefreshRate);
SAME_OFFSET(ApplicationStateV01, mWindowed);
SAME_OFFSET(ApplicationStateV01, mOptionsLocation);
SAME_OFFSET(ApplicationStateV01, mOptionsPage);
SAME_OFFSET(ApplicationStateV01, mExpansion);

// ---------------------------------------------------------------------------
// The mapping wrapper
// ---------------------------------------------------------------------------

SAME_OFFSET(SharedMemoryGeneric, events);
SAME_OFFSET(SharedMemoryGeneric, gameVersion);
SAME_OFFSET(SharedMemoryGeneric, FFBTorque);
SAME_OFFSET(SharedMemoryGeneric, appInfo);

SAME_OFFSET(SharedMemoryPathData, userData);
SAME_OFFSET(SharedMemoryPathData, customVariables);
SAME_OFFSET(SharedMemoryPathData, stewardResults);
SAME_OFFSET(SharedMemoryPathData, playerProfile);
SAME_OFFSET(SharedMemoryPathData, pluginsFolder);

SAME_OFFSET(SharedMemoryScoringData, scoringInfo);
SAME_OFFSET(SharedMemoryScoringData, scoringStreamSize);
SAME_OFFSET(SharedMemoryScoringData, vehScoringInfo);
SAME_OFFSET(SharedMemoryScoringData, scoringStream);

SAME_OFFSET(SharedMemoryTelemetryData, activeVehicles);
SAME_OFFSET(SharedMemoryTelemetryData, playerVehicleIdx);
SAME_OFFSET(SharedMemoryTelemetryData, playerHasVehicle);
SAME_OFFSET(SharedMemoryTelemetryData, telemInfo);

SAME_OFFSET(SharedMemoryObjectOut, generic);
SAME_OFFSET(SharedMemoryObjectOut, paths);
SAME_OFFSET(SharedMemoryObjectOut, scoring);
SAME_OFFSET(SharedMemoryObjectOut, telemetry);

SAME_OFFSET(SharedMemoryLayout, data);

// ---------------------------------------------------------------------------
// Enumerator and array-bound agreement.
//
// The static_asserts above compare offsets, which would not notice the vehicle
// array keeping its size while the SDK's SME_MAX or vehicle ceiling changed
// underneath it.
// ---------------------------------------------------------------------------

static_assert(static_cast<int>(vendored::SME_MAX) == static_cast<int>(::SME_MAX),
              "the SDK's shared memory event list changed length");
static_assert(vendored::SME_UPDATE_SCORING == ::SME_UPDATE_SCORING,
              "SME_UPDATE_SCORING moved within the event enum");
static_assert(vendored::SME_UPDATE_TELEMETRY == ::SME_UPDATE_TELEMETRY,
              "SME_UPDATE_TELEMETRY moved within the event enum");
static_assert(vendored::SME_START_SESSION == ::SME_START_SESSION,
              "SME_START_SESSION moved within the event enum");
static_assert(vendored::SME_END_SESSION == ::SME_END_SESSION,
              "SME_END_SESSION moved within the event enum");

static_assert(sizeof(vendored::SharedMemoryScoringData::vehScoringInfo) /
                      sizeof(vendored::VehicleScoringInfoV01) ==
                  vendored::kLmuMaxVehicles,
              "vendored vehicle array bound is inconsistent with itself");
static_assert(sizeof(::SharedMemoryScoringData::vehScoringInfo) /
                      sizeof(::VehicleScoringInfoV01) ==
                  vendored::kLmuMaxVehicles,
              "the SDK's vehicle ceiling is no longer 104");
static_assert(sizeof(::SharedMemoryTelemetryData::telemInfo) /
                      sizeof(::TelemInfoV01) ==
                  vendored::kLmuMaxVehicles,
              "the SDK's telemetry vehicle ceiling is no longer 104");
static_assert(sizeof(::SharedMemoryScoringData::scoringStream) ==
                  vendored::kLmuResultsStreamBytes,
              "the SDK's results stream buffer is no longer 64 KiB");

int main() {
  std::printf(
      "Layout check passed: lmu-shared-memory-layout.hpp agrees with the "
      "installed SDK header.\n");
  return 0;
}
