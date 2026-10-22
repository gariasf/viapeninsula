# Roadmap: milestones, lanes and follow-ups

How a session chooses what to build and what to file. The maintainer set these rules on 12 Oct 2026. By then the tracker had 147 open issues and nothing ordered them, and each worked ticket was filing about two follow-ups.

## Milestones

GitHub milestones order the work. Each milestone's description is the source of truth for three things:
- its goal;
- its exit criteria;
- the **Order** of its critical path.

Read it with `gh api repos/{owner}/{repo}/milestones`.

Milestones are numbered, and each is in one of three states, which the last line of its description names:
- **Now**: build only from these. Since 22 Oct 2026 it is milestone 6 alone; 0, 1, 2, 3, 4, 5, 7 and 8 have closed (7 at its numbers, by its stop rule). The page lane has no Now milestone until the maintainer picks one.
- **Next**: none.
- **Later**: the icebox.

Rules:
- **Within a Now milestone**, take its Order first, then its other issues in any order.
- **A Later issue** gets built only when it is small and sits in code that a Now ticket already changes. Fold it into that ticket's PR, and close it along with that ticket.
- **A milestone closes** when its exit criteria are met, measured the way its description says. Its leftover issues move to Later, and the next milestone in its lane becomes Now.
- **Every issue has a milestone.** Give it one when you file it: the milestone it serves if it is critical or major, otherwise Later.
- **Exceptions:** the specs (#141, #214, #318) and the build report's issue (#290) have no milestone.

## Lanes

Two lanes split the code so two sessions can build at once:
- **The page lane** is milestones 0, 1, 3, 4, 7 and 8: src/web, and the page's loading and drawing.
- **The data lane** is milestones 0, 2, 5 and 6: the fetcher, the engine's live rules, and the build.

At most two sessions build at once, one per lane.

Before claiming a ticket, check what the other lane holds: its memory notes, `git worktree list`, and its open PRs.

A bare `/implement` takes at most three tickets, or one cluster, from its lane's Now milestone. It reports and then stops. A further batch starts when the maintainer asks for one.

A **cluster** is a set of issues that a milestone's description lists together; the first one is its lead. Build a cluster as one ticket: one branch, and one PR that closes every issue in it.

## Follow-ups

A problem found while working on a ticket becomes a new issue only when it is **critical** or **major**:

- **critical**: a freeze, a stall, a page that doesn't load, a broken state, data shown as right that is wrong for many Trains, or a regression of shipped behaviour;
- **major**: something many viewers see in normal use, such as at common zooms in big cities, or across a whole Line or Network.

Everything else goes in the ticket's closing comment, under **Seen, not filed**, one line each with its numbers. That covers:
- **minor**: one place, zoom or moment, or a few Trains;
- **cosmetic**: pixel-level, sub-second, or seen only in measurements;
- **internal**: docs, tests or tooling.

Anyone can file one of those later.

When a problem is inside the ticket's own change and scope, fix it in the ticket.

Aim for at most one filed follow-up per ticket. A ticket that wants to file more than two asks the maintainer in its OK batch.
