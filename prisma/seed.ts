import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  console.log("🌱 Starting database seeding...");

  // 1. Seed Plans
  const freePlan = await prisma.plan.upsert({
    where: { name: "FREE" },
    update: { aiDailyLimit: 10, price: 0 },
    create: {
      name: "FREE",
      aiDailyLimit: 10,
      price: 0,
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: "PRO" },
    update: { aiDailyLimit: 100, price: 1500 },
    create: {
      name: "PRO",
      aiDailyLimit: 100,
      price: 1500, // $15.00
    },
  });

  console.log("✓ Plans seeded (FREE, PRO)");

  // 2. Seed Tags
  const tagNames = [
    "technology",
    "ai",
    "webdev",
    "programming",
    "productivity",
    "startups",
    "design",
    "writing",
  ];

  const tags: Record<string, { id: string; name: string }> = {};
  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    tags[name] = tag;
  }

  console.log(`✓ ${tagNames.length} Tags seeded`);

  // 3. Seed Users
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const usersData = [
    {
      email: "sarah@example.com",
      username: "sarah_dev",
      name: "Sarah Connor",
      bio: "Staff Engineer & AI explorer. Writing about distributed systems and LLMs.",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
      planId: proPlan.id,
      interests: ["technology", "ai", "programming"],
    },
    {
      email: "alex@example.com",
      username: "alex_code",
      name: "Alex Mercer",
      bio: "Full-stack builder passionate about TypeScript, React, and UX.",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
      planId: freePlan.id,
      interests: ["webdev", "programming", "design"],
    },
    {
      email: "maya@example.com",
      username: "maya_writes",
      name: "Maya Lin",
      bio: "Technical writer & product thinker. Turning complex code into clear stories.",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
      planId: freePlan.id,
      interests: ["writing", "productivity", "startups"],
    },
    {
      email: "david@example.com",
      username: "david_tech",
      name: "David Kim",
      bio: "DevOps & cloud architect. Docker, Kubernetes, and reliable infra.",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
      planId: freePlan.id,
      interests: ["technology", "programming", "productivity"],
    },
    {
      email: "elena@example.com",
      username: "elena_ai",
      name: "Elena Rostova",
      bio: "Researcher and developer delving into generative models and agentic workflows.",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150",
      planId: freePlan.id,
      interests: ["ai", "technology", "startups"],
    },
  ];

  const users: Array<{ id: string; username: string; email: string }> = [];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        username: u.username,
        bio: u.bio,
        avatar: u.avatar,
        planId: u.planId,
        hasOnboarded: true,
      },
      create: {
        email: u.email,
        username: u.username,
        passwordHash,
        name: u.name,
        bio: u.bio,
        avatar: u.avatar,
        planId: u.planId,
        hasOnboarded: true,
      },
    });

    users.push(user);

    // Sync interests
    for (const interestName of u.interests) {
      const tag = tags[interestName];
      if (tag) {
        await prisma.interest.upsert({
          where: {
            userId_tagId: {
              userId: user.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            userId: user.id,
            tagId: tag.id,
          },
        });
      }
    }
  }

  console.log(`✓ ${users.length} Users seeded with interest tags`);

  // 4. Seed Follow Relationships
  const followPairs: Array<[number, number]> = [
    [0, 1], // Sarah follows Alex
    [0, 4], // Sarah follows Elena
    [1, 0], // Alex follows Sarah (mutual)
    [1, 2], // Alex follows Maya
    [2, 0], // Maya follows Sarah
    [2, 3], // Maya follows David
    [3, 0], // David follows Sarah
    [3, 1], // David follows Alex
    [4, 0], // Elena follows Sarah (mutual)
    [4, 1], // Elena follows Alex
  ];

  for (const [followerIdx, followingIdx] of followPairs) {
    const follower = users[followerIdx];
    const following = users[followingIdx];
    if (follower && following) {
      await prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: follower.id,
            followingId: following.id,
          },
        },
        update: {},
        create: {
          followerId: follower.id,
          followingId: following.id,
        },
      });
    }
  }

  console.log(`✓ ${followPairs.length} Follow relations seeded`);

  // Helper for BlockNote JSON format
  const makeBlockNoteContent = (paragraphs: string[]) => {
    return paragraphs.map((text, i) => ({
      id: `block-${i + 1}`,
      type: "paragraph",
      props: {
        textColor: "default",
        backgroundColor: "default",
        textAlignment: "left",
      },
      content: [{ type: "text", text, styles: {} }],
      children: [],
    }));
  };

  // 5. Seed 20 Posts
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  const rawPosts = [
    {
      authorIdx: 0,
      title: "Building Production-Ready SSE Streaming with Node.js and LLMs",
      paragraphs: [
        "Server-Sent Events (SSE) offer a lightweight, one-way HTTP connection perfect for streaming AI completions.",
        "Unlike WebSockets, SSE reconnects natively and avoids heavy protocol negotiation. Here is how we handle backpressure and client disconnection cleanly.",
        "Always listen to req.on('close') to destroy your upstream readable stream and save expensive tokens.",
      ],
      tagNames: ["technology", "ai", "programming"],
      hoursAgo: 2,
      readingTime: 4,
    },
    {
      authorIdx: 0,
      title: "Why In-Memory Redis Trumps PostgreSQL for Sliding Window Rate Limiting",
      paragraphs: [
        "Database write contention becomes a choke point under sustained API load.",
        "Redis atomic INCR combined with TTL operations executes in sub-milliseconds without triggering table bloat.",
        "We also add random jitter to the key expiration to eliminate cache stampedes when large caches expire.",
      ],
      tagNames: ["technology", "webdev"],
      hoursAgo: 14,
      readingTime: 3,
    },
    {
      authorIdx: 0,
      title: "Designing Event-Driven Microservices Without the Complexity",
      paragraphs: [
        "Distributed architectures often start simple and devolve into maintenance nightmares.",
        "Before reaching for Kafka, consider whether transactional outbox in PostgreSQL solves 95% of your decoupling needs.",
      ],
      tagNames: ["programming", "technology"],
      hoursAgo: 72, // 3 days ago
      readingTime: 5,
    },
    {
      authorIdx: 0,
      title: "Zero-Downtime Database Migrations: The Expand and Contract Pattern",
      paragraphs: [
        "Renaming columns or changing schema types live in production requires two distinct deployment phases.",
        "Phase 1: Expand by adding the new column and writing to both. Phase 2: Contract by migrating backfill and dropping the deprecated column.",
      ],
      tagNames: ["programming", "startups"],
      hoursAgo: 240, // 10 days ago
      readingTime: 6,
    },
    {
      authorIdx: 1,
      title: "Mastering Next.js 16 App Router and the New Proxy Boundary",
      paragraphs: [
        "In Next.js 16, proxy.ts replaces traditional edge middleware for high-performance network interception.",
        "Learn how to inspect request headers, redirect unauthenticated users, and pass forward context seamlessly.",
      ],
      tagNames: ["webdev", "programming"],
      hoursAgo: 5,
      readingTime: 4,
    },
    {
      authorIdx: 1,
      title: "The Case for Pure Session Authentication over Stateless JWTs",
      paragraphs: [
        "Stateless JWTs suffer from one glaring flaw: immediate revocation requires either token blacklisting or short TTLs.",
        "Pure session authentication backed by an in-memory cache gives you instant revocation on logout with zero latency penalty.",
      ],
      tagNames: ["webdev", "technology"],
      hoursAgo: 26, // ~1 day ago
      readingTime: 4,
    },
    {
      authorIdx: 1,
      title: "Accessible Component Design: Building for Everyone",
      paragraphs: [
        "Web accessibility is not an afterthought or an extra ticket on your sprint board.",
        "From semantic landmarks to focus traps and ARIA live regions, here are practical patterns for clean UI libraries.",
      ],
      tagNames: ["design", "webdev"],
      hoursAgo: 120, // 5 days ago
      readingTime: 5,
    },
    {
      authorIdx: 1,
      title: "Tailwind CSS v4 Under the Hood: The High Performance Engine",
      paragraphs: [
        "The new oxide engine in Tailwind 4 drastically accelerates build times and simplifies stylesheet configuration.",
        "Here are the core breaking shifts and how to migrate your theme tokens cleanly.",
      ],
      tagNames: ["webdev", "design"],
      hoursAgo: 360, // 15 days ago
      readingTime: 3,
    },
    {
      authorIdx: 2,
      title: "The Art of the Technical One-Pager: How to Convince Leadership",
      paragraphs: [
        "Great engineering proposals are concise, highlight trade-offs, and explicitly state what you are NOT doing.",
        "Use this battle-tested template to get architecture designs approved in a single review meeting.",
      ],
      tagNames: ["writing", "productivity"],
      hoursAgo: 8,
      readingTime: 3,
    },
    {
      authorIdx: 2,
      title: "Writing Clear Documentation for Fast-Moving Startups",
      paragraphs: [
        "Nobody reads a 50-page architecture wiki that is two sprints out of date.",
        "Keep documentation colocated with the codebase and treat docs as code with automated linting.",
      ],
      tagNames: ["writing", "startups"],
      hoursAgo: 48, // 2 days ago
      readingTime: 4,
    },
    {
      authorIdx: 2,
      title: "Deep Work Rituals for Knowledge Workers",
      paragraphs: [
        "Context switching degrades cognitive capacity by up to 40%.",
        "Structuring your calendar into maker vs manager time blocks protects the mental space required for non-trivial problem solving.",
      ],
      tagNames: ["productivity"],
      hoursAgo: 168, // 7 days ago
      readingTime: 5,
    },
    {
      authorIdx: 2,
      title: "Why Every Developer Should Maintain a Public Digital Garden",
      paragraphs: [
        "A digital garden is not a traditional blog. It is a collection of evolving notes, ideas, and half-formed thoughts.",
        "Writing in public acts as a magnet for like-minded collaborators and keeps your thinking sharp.",
      ],
      tagNames: ["writing", "productivity"],
      hoursAgo: 480, // 20 days ago
      readingTime: 4,
    },
    {
      authorIdx: 3,
      title: "Containerizing Node.js Microservices: Multi-Stage Builds and Security",
      paragraphs: [
        "Stop shipping 1GB Docker images with development compilers and source maps into production.",
        "Use multi-stage Docker builds with unprivileged node users and minimal Alpine or distroless base images.",
      ],
      tagNames: ["technology", "programming"],
      hoursAgo: 18,
      readingTime: 4,
    },
    {
      authorIdx: 3,
      title: "PostgreSQL Indexing Strategies: B-Tree, GIN, and Partial Indexes",
      paragraphs: [
        "Adding indexes blindly slows down writes and bloats disk cache.",
        "Understand when to use partial indexes for soft-deleted rows and GIN indexes for JSONB and tag arrays.",
      ],
      tagNames: ["programming", "technology"],
      hoursAgo: 96, // 4 days ago
      readingTime: 6,
    },
    {
      authorIdx: 3,
      title: "Infrastructure as Code: Lessons Learned Migrating to Terraform",
      paragraphs: [
        "Clicking around in AWS or GCP console is fine for prototypes, but fatal for disaster recovery.",
        "Here is how to manage state locks, secret injection, and reproducible staging environments with Terraform.",
      ],
      tagNames: ["technology", "startups"],
      hoursAgo: 216, // 9 days ago
      readingTime: 5,
    },
    {
      authorIdx: 3,
      title: "Practical Monitoring: The 4 Golden Signals of SRE",
      paragraphs: [
        "Latency, traffic, errors, and saturation. These 4 signals tell you if your service is actually healthy.",
        "Set up actionable alerts on customer-impacting SLO breaches rather than noisy CPU percentage spikes.",
      ],
      tagNames: ["technology", "productivity"],
      hoursAgo: 600, // 25 days ago
      readingTime: 4,
    },
    {
      authorIdx: 4,
      title: "Agentic AI Architectures: Moving Beyond Simple RAG",
      paragraphs: [
        "Retrieval-Augmented Generation only gets you so far when workflows require multi-step reasoning.",
        "Autonomous agents armed with deterministic tool definitions and self-correcting loops unlock actual automation.",
      ],
      tagNames: ["ai", "technology"],
      hoursAgo: 3,
      readingTime: 6,
    },
    {
      authorIdx: 4,
      title: "Prompt Engineering vs Fine-Tuning: Making the Practical Choice",
      paragraphs: [
        "Fine-tuning is expensive, slow to iterate, and often unnecessary.",
        "Few-shot prompting with structured JSON schemas and DSPy delivers 90% of the accuracy at 5% of the operational cost.",
      ],
      tagNames: ["ai", "programming"],
      hoursAgo: 36, // 1.5 days ago
      readingTime: 5,
    },
    {
      authorIdx: 4,
      title: "The Ethics and Economics of Foundation Model APIs",
      paragraphs: [
        "As frontier models converge on benchmark intelligence, pricing wars and inference latency become the key differentiators.",
        "Here is how developer teams can avoid vendor lock-in with open routing abstractions.",
      ],
      tagNames: ["ai", "startups"],
      hoursAgo: 144, // 6 days ago
      readingTime: 4,
    },
    {
      authorIdx: 4,
      title: "Local LLMs on Apple Silicon: Running 70B Models with MLX",
      paragraphs: [
        "Apple's unified memory architecture makes M-series chips incredible development machines for local inference.",
        "We benchmark 4-bit quantized Llama 3 models running completely offline with high tokens-per-second.",
      ],
      tagNames: ["ai", "technology"],
      hoursAgo: 672, // 28 days ago
      readingTime: 5,
    },
  ];

  const seededPosts = [];

  for (let i = 0; i < rawPosts.length; i++) {
    const postData = rawPosts[i]!;
    const author = users[postData.authorIdx]!;
    const publishedAt = new Date(now - postData.hoursAgo * hourMs);

    // Initial base recency score: decays with time
    const recencyScore = 1 / (1 + postData.hoursAgo / 24);

    // Give some posts artificial engagement velocity for varied score ordering
    const baseLikes = ((i * 7) % 5) + 1;
    const baseComments = (i % 3);
    const initialScore = Number((recencyScore + (baseLikes + baseComments * 2) * 0.1).toFixed(4));

    const post = await prisma.post.upsert({
      where: {
        id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
      },
      update: {
        title: postData.title,
        content: makeBlockNoteContent(postData.paragraphs),
        status: "PUBLISHED",
        score: initialScore,
        readingTime: postData.readingTime,
        publishedAt,
      },
      create: {
        id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
        authorId: author.id,
        title: postData.title,
        content: makeBlockNoteContent(postData.paragraphs),
        status: "PUBLISHED",
        score: initialScore,
        readingTime: postData.readingTime,
        viewCount: baseLikes * 12 + 10,
        publishedAt,
      },
    });

    seededPosts.push(post);

    // Link Post tags
    for (const tagName of postData.tagNames) {
      const tag = tags[tagName];
      if (tag) {
        await prisma.postTag.upsert({
          where: {
            postId_tagId: {
              postId: post.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            postId: post.id,
            tagId: tag.id,
          },
        });
      }
    }
  }

  console.log(`✓ ${seededPosts.length} Published posts seeded with tags and scores`);

  // 6. Seed Likes, Bookmarks, and Comments across posts
  const commentTexts = [
    "Fantastic breakdown, this cleared up several misconceptions I had!",
    "Bookmarking this immediately. The code sample is super clean.",
    "Great article. How would you handle connection timeouts in this scenario?",
    "Spot on. We encountered this exact bottleneck in production last month.",
    "Very helpful practical guide. Thanks for sharing!",
  ];

  for (let i = 0; i < seededPosts.length; i++) {
    const post = seededPosts[i]!;
    // Assign 1-3 likers
    const numLikes = (i % 4) + 1;
    for (let u = 0; u < numLikes; u++) {
      const user = users[(i + u) % users.length]!;
      await prisma.like.upsert({
        where: {
          userId_postId: {
            userId: user.id,
            postId: post.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          postId: post.id,
        },
      });
    }

    // Assign bookmark occasionally
    if (i % 2 === 0) {
      const user = users[(i + 1) % users.length]!;
      await prisma.bookmark.upsert({
        where: {
          userId_postId: {
            userId: user.id,
            postId: post.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          postId: post.id,
        },
      });
    }

    // Add 1-2 comments on popular posts
    if (i % 2 === 0) {
      const commenter = users[(i + 2) % users.length]!;
      const body = commentTexts[i % commentTexts.length]!;
      const commentId = `11111111-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;

      await prisma.comment.upsert({
        where: { id: commentId },
        update: { body },
        create: {
          id: commentId,
          postId: post.id,
          authorId: commenter.id,
          body,
        },
      });
    }
  }

  console.log("✓ Likes, bookmarks, and comments populated across posts");
  console.log("🎉 Seeding finished successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

