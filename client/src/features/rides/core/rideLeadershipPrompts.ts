/**
 * What to ask before a rider leaves a ride, or before the captain hands it
 * to someone else. The server sends `next_captain` only to the captain: the
 * rider who takes over if they leave, or null when nobody else is on the
 * ride and leaving cancels it.
 */

export interface LeavableRide {
  title: string;
  /** Absent for riders; for the captain, who takes over (null: nobody). */
  next_captain?: { display_name: string } | null;
}

export interface ConfirmPrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

export const leaveRidePrompt = (ride: LeavableRide): ConfirmPrompt => {
  const title = `Leave ${ride.title}?`;

  if (ride.next_captain === undefined) {
    return {
      title,
      message: "Your seat goes back to the ride. You can join again while it has room.",
      confirmLabel: "Leave",
    };
  }

  if (ride.next_captain === null) {
    return {
      title,
      message: "Nobody else is on this ride, so it will be cancelled when you leave.",
      confirmLabel: "Leave and cancel",
    };
  }

  return {
    title,
    message: `${ride.next_captain.display_name} will become the captain and lead the ride.`,
    confirmLabel: "Leave",
  };
};

export const makeCaptainPrompt = (riderName: string): ConfirmPrompt => ({
  title: `Make ${riderName} the captain?`,
  message: `${riderName} will lead the ride and receive its group alerts. You stay on as a co-captain.`,
  confirmLabel: "Make captain",
});
