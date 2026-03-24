import type { Request, Response } from "express";
import {
  CreatePostSchema,
  CreateCommentSchema,
  CreateGroupSchema,
  CreateReviewSchema,
} from "../schemas/community.schemas.js";
import * as CommunityService from "../services/community.service.js";

interface RiderPayload {
  riderId: string;
  email: string;
}
const rid = (req: Request) => (req.rider as unknown as RiderPayload).riderId;

// ── Posts ────────────────────────────────────────────────────────────────────

export const createPost = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = CreatePostSchema.parse(req.body);
    const post = await CommunityService.createPost(rid(req), data);
    res.status(201).json(post);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getFeed = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const posts = await CommunityService.getFeed(limit, offset);
    res.json(posts);
  } catch (error: any) {
    console.error("Error fetching feed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const post = await CommunityService.getPostById(req.params.id as string);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json(post);
  } catch (error: any) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updatePost = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const post = await CommunityService.updatePost(
      req.params.id as string,
      rid(req),
      content,
    );
    if (!post) {
      res.status(404).json({ error: "Post not found or not yours" });
      return;
    }
    res.json(post);
  } catch (error: any) {
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deletePost = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const deleted = await CommunityService.deletePost(
      req.params.id as string,
      rid(req),
    );
    if (!deleted) {
      res.status(404).json({ error: "Post not found or not yours" });
      return;
    }
    res.json({ message: "Post deleted" });
  } catch (error: any) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Comments ────────────────────────────────────────────────────────────────

export const addComment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = CreateCommentSchema.parse(req.body);
    const comment = await CommunityService.addComment(
      req.params.id as string,
      rid(req),
      data,
    );
    res.status(201).json(comment);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getComments = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const comments = await CommunityService.getComments(
      req.params.id as string,
    );
    res.json(comments);
  } catch (error: any) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateComment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const comment = await CommunityService.updateComment(
      req.params.id as string,
      rid(req),
      content,
    );
    if (!comment) {
      res.status(404).json({ error: "Comment not found or unauthorized" });
      return;
    }

    res.json(comment);
  } catch (error: any) {
    console.error("Error updating comment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteComment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const deleted = await CommunityService.deleteComment(
      req.params.id as string,
      rid(req),
    );
    if (!deleted) {
      res.status(404).json({ error: "Comment not found or unauthorized" });
      return;
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Likes ───────────────────────────────────────────────────────────────────

export const likePost = async (req: Request, res: Response): Promise<void> => {
  try {
    const liked = await CommunityService.likePost(
      req.params.id as string,
      rid(req),
    );

    // If it wasn't liked, it means the ON CONFLICT returned nothing because the user already liked it!
    // So we catch it and automatically unlike it to create a seamless toggle effect.
    if (!liked) {
      await CommunityService.unlikePost(req.params.id as string, rid(req));
      res.json({ message: "Like removed" });
      return;
    }

    res.json({ message: "Post liked" });
  } catch (error: any) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unlikePost = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const unliked = await CommunityService.unlikePost(
      req.params.id as string,
      rid(req),
    );
    if (!unliked) {
      res.status(404).json({ error: "Like not found" });
      return;
    }
    res.json({ message: "Like removed" });
  } catch (error: any) {
    console.error("Error unliking post:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Follows ─────────────────────────────────────────────────────────────────

export const follow = async (req: Request, res: Response): Promise<void> => {
  try {
    const followed = await CommunityService.followRider(
      rid(req),
      req.params.id as string,
    );
    res.json({ message: followed ? "Now following" : "Already following" });
  } catch (error: any) {
    if (error.message === "Cannot follow yourself") {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("Error following:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unfollow = async (req: Request, res: Response): Promise<void> => {
  try {
    const unfollowed = await CommunityService.unfollowRider(
      rid(req),
      req.params.id as string,
    );
    if (!unfollowed) {
      res.status(404).json({ error: "Not following this rider" });
      return;
    }
    res.json({ message: "Unfollowed" });
  } catch (error: any) {
    console.error("Error unfollowing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getFollowers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    res.json(await CommunityService.getFollowers(req.params.id as string));
  } catch (error: any) {
    console.error("Error fetching followers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getFollowing = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    res.json(await CommunityService.getFollowing(req.params.id as string));
  } catch (error: any) {
    console.error("Error fetching following:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Groups ──────────────────────────────────────────────────────────────────

export const createGroup = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = CreateGroupSchema.parse(req.body);
    const group = await CommunityService.createGroup(rid(req), data);
    res.status(201).json(group);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listGroups = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const scopeParam = String(req.query.scope || "all").toLowerCase();
    const scope: CommunityService.GroupListScope =
      scopeParam === "public" || scopeParam === "joined" || scopeParam === "all"
        ? scopeParam
        : "all";
    res.json(await CommunityService.listGroups(rid(req), scope));
  } catch (error: any) {
    console.error("Error listing groups:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const group = await CommunityService.getGroupById(
      req.params.id as string,
      rid(req),
    );
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json(group);
  } catch (error: any) {
    console.error("Error fetching group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const joinGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await CommunityService.joinGroup(
      req.params.id as string,
      rid(req),
    );
    res.json(status);
  } catch (error: any) {
    if (error.message === "Group not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.message === "Cannot join private group") {
      res.status(403).json({ error: error.message });
      return;
    }
    console.error("Error joining group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const leaveGroup = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const left = await CommunityService.leaveGroup(
      req.params.id as string,
      rid(req),
    );
    if (!left) {
      res.status(400).json({ error: "Cannot leave (admin or not a member)" });
      return;
    }
    res.json({ message: "Left group" });
  } catch (error: any) {
    console.error("Error leaving group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Ride Reviews ────────────────────────────────────────────────────────────

export const addReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = CreateReviewSchema.parse(req.body);
    const review = await CommunityService.addRideReview(
      req.params.rideId as string,
      rid(req),
      data,
    );
    res.status(201).json(review);
  } catch (error: any) {
    if (error.name === "ZodError") {
      res.status(400).json({ errors: error.issues });
      return;
    }
    if (error.code === "23505") {
      res.status(409).json({ error: "You have already reviewed this ride" });
      return;
    }
    if (error.message === "Ride not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.message === "Reviews are only allowed for completed rides") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error.message === "Only ride participants can submit a review") {
      res.status(403).json({ error: error.message });
      return;
    }
    console.error("Error adding review:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getReviews = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    res.json(
      await CommunityService.getRideReviews(req.params.rideId as string),
    );
  } catch (error: any) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
