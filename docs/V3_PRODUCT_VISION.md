# Step Outside V3.0 Product Vision

## Vision

Step Outside is evolving from an individual outdoor habit tracker into a community-driven outdoor wellness platform.

> A community-driven outdoor wellness platform that helps individuals, families, workplaces, and communities build healthier lives together.

## Mission

> Step Outside exists to bring people together through the simple act of getting outdoors.

## Guiding principle

> Technology should not compete with nature. It should inspire people to experience it together.

Every V3 decision should reduce friction between intention and real-world outdoor connection. The product should invite action, make shared progress visible, and then get out of the way.

## Product hierarchy

1. Community
2. Connection
3. Nature
4. Movement
5. Health

This order is a decision framework. When priorities compete, V3 should first strengthen healthy communities and meaningful connection, then deepen time in nature and movement, with improved health as the outcome.

## Product direction

Walking remains a core activity, but V3 expands the product around:

- Outdoor activity
- Accountability
- Friendships
- Teams
- Company wellness
- Group challenges
- Shared progress
- Positive real-world connection

V3 must remain genuinely useful for an individual user. Solo activity tracking, personal goals, streaks, history, reflections, routes, and progress insights remain valuable. The evolution is to make social participation, groups, teams, challenges, and leaderboards more prominent without making community participation a requirement.

## V3 experience pillars

### Community that welcomes different scales

The same product foundation should support a pair of friends, a family, an informal group, a workplace team, and a broader local community. Community features should feel approachable at small scale and coherent as participation grows.

### Connection through action

Social mechanics should lead to shared outdoor experiences, encouragement, accountability, and celebration. They should avoid passive engagement loops that keep people looking at a screen.

### Flexible outdoor movement

Walking stays central while the activity model grows to represent more ways of being active outdoors. Shared goals should accommodate distance, activity count, time outside, consistency, and other inclusive measures of participation.

### Shared progress without unhealthy pressure

Challenges and leaderboards should motivate a wide range of people. Team goals, participation milestones, personal improvement, and collective consistency should matter alongside absolute rankings.

### Individual value at every stage

Users who have not joined a group—or who prefer to participate alone—must retain a complete, motivating outdoor wellness experience. Community features should add value rather than gate the core habit loop.

## Existing foundation to evolve

V3 builds on the production application rather than replacing it. The current app already includes:

- Timer- and GPS-based walking and hiking activities, saved routes, post-activity completion, sharing, and reflections
- Personal history, aggregate statistics, weekly and monthly goals, standard streaks, Premium streak insights, and sunrise/sunset achievements
- Authentication, public profiles, profile editing, usernames, user discovery, friend requests, friendships, and friend activity summaries
- One-to-one weekly friend challenge invitations for distance, walk count, or minutes outside
- Friends and global leaderboards across weekly, monthly, and all-time periods
- Firebase-backed authentication, profiles, social data, challenge data, leaderboard data, activity sync, and storage
- RevenueCat-backed Premium entitlement, offerings, purchase, restore, and authenticated identity synchronization

These capabilities are the starting point. V3 should extend their data models, permissions, navigation, and user experience incrementally so existing users and production data remain supported.

## Near-term product implications

V3 planning should prioritize:

1. A first-class community destination that brings friends, groups, teams, challenges, and shared progress into the primary navigation.
2. A durable group and membership model that can represent families, informal groups, workplaces, and communities.
3. Team and group challenges that build on the existing friend challenge model while supporting shared goals and contribution tracking.
4. Leaderboards that support group and team scopes, inclusive scoring, privacy controls, and healthy competition.
5. Activity and profile models that can expand beyond walking and hiking without breaking existing sessions or history.
6. Clear roles, invitations, moderation, visibility, and data-access rules before broader community growth.
7. Company wellness capabilities built on the same community primitives rather than a separate application.

## Product guardrails

- Evolve the existing Expo application; do not create a parallel rewrite.
- Preserve current users, activities, streaks, friendships, purchases, and production identifiers.
- Keep core individual activity tracking available without requiring social participation.
- Prefer real-world connection and outdoor action over screen time, feeds, or engagement for its own sake.
- Make privacy, consent, safety, and group visibility explicit in every social feature.
- Design competitive mechanics to encourage consistency and collective progress, not shame or exclusion.
- Introduce schema and navigation changes incrementally, with migration and backward compatibility planned before rollout.
- Validate community features at friend and small-group scale before expanding to workplace and community administration.

## V3 success

V3 succeeds when people go outside more consistently because other people are meaningfully part of the experience. Individual progress remains clear, but the defining value is that friends, families, teams, workplaces, and communities can turn outdoor activity into a shared healthy practice.
