/**
 * What to ask before a rider leaves a group. The server sends `next_admin`
 * only to the group's owner: the member who takes over when they leave, or
 * null when nobody else is in it and leaving deletes the group.
 */

export interface LeavableGroup {
  name: string;
  /** Absent for members; for the owner, who takes over (null: nobody). */
  next_admin?: { display_name: string } | null;
}

export interface LeaveGroupPrompt {
  title: string;
  message: string;
  confirmLabel: string;
}

export const leaveGroupPrompt = (group: LeavableGroup): LeaveGroupPrompt => {
  const title = `Leave ${group.name}?`;

  if (group.next_admin === undefined) {
    return { title, message: "You can join again later if the group is public.", confirmLabel: "Leave" };
  }

  if (group.next_admin === null) {
    return {
      title,
      message: "You're the only member, so the group will be deleted when you leave.",
      confirmLabel: "Leave and delete",
    };
  }

  return {
    title,
    message: `${group.next_admin.display_name} will become the admin and run the group.`,
    confirmLabel: "Leave",
  };
};
