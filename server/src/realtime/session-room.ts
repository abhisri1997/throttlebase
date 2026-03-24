export const buildLiveRoomKey = (rideId: string, sessionId: string): string =>
  `ride:${rideId}:session:${sessionId}`;

export const buildRideSocketKey = (rideId: string, riderId: string): string =>
  `${rideId}:${riderId}`;
