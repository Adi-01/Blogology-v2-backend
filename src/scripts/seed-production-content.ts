import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

interface EditorialBlock {
  type: string;
  text: string;
  level?: number;
  language?: string;
}

function makeEditorialContent(blocks: EditorialBlock[]) {
  return blocks.map((b, i) => {
    const id = `block-${i + 1}`;
    if (b.type === "heading") {
      return {
        id,
        type: "heading",
        props: {
          textColor: "default",
          backgroundColor: "default",
          textAlignment: "left",
          level: b.level ?? 2,
        },
        content: [{ type: "text", text: b.text, styles: {} }],
        children: [],
      };
    }
    if (b.type === "quote") {
      return {
        id,
        type: "quote",
        props: {
          textColor: "default",
          backgroundColor: "default",
        },
        content: [{ type: "text", text: b.text, styles: {} }],
        children: [],
      };
    }
    if (b.type === "bullet") {
      return {
        id,
        type: "bulletListItem",
        props: {
          textColor: "default",
          backgroundColor: "default",
          textAlignment: "left",
        },
        content: [{ type: "text", text: b.text, styles: {} }],
        children: [],
      };
    }
    if (b.type === "numbered") {
      return {
        id,
        type: "numberedListItem",
        props: {
          textColor: "default",
          backgroundColor: "default",
          textAlignment: "left",
        },
        content: [{ type: "text", text: b.text, styles: {} }],
        children: [],
      };
    }
    if (b.type === "code") {
      return {
        id,
        type: "codeBlock",
        props: {
          language: b.language ?? "typescript",
        },
        content: [{ type: "text", text: b.text, styles: {} }],
        children: [],
      };
    }
    return {
      id,
      type: "paragraph",
      props: {
        textColor: "default",
        backgroundColor: "default",
        textAlignment: "left",
      },
      content: [{ type: "text", text: b.text, styles: {} }],
      children: [],
    };
  });
}

async function main() {
  console.log("🌱 Starting production content seeding...");

  // 1. Ensure Plans exist
  const freePlan = await prisma.plan.upsert({
    where: { name: "FREE" },
    update: { aiDailyLimit: 10, price: 0 },
    create: { name: "FREE", aiDailyLimit: 10, price: 0 },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: "PRO" },
    update: { aiDailyLimit: 100, price: 1500 },
    create: { name: "PRO", aiDailyLimit: 100, price: 1500 },
  });

  console.log("✓ Plans verified (FREE, PRO)");

  // 2. Seed additional modern tech tags
  const newTagNames = [
    "architecture",
    "cloud",
    "security",
    "database",
    "frontend",
    "backend",
    "devops",
    "performance",
    "systemdesign",
    "typescript",
    "testing",
    "career",
    "technology",
    "webdev",
    "programming",
    "productivity",
    "startups",
    "design",
  ];

  const tagMap: Record<string, { id: string; name: string }> = {};
  for (const name of newTagNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    tagMap[name] = tag;
  }
  console.log(`✓ ${newTagNames.length} Tags ensured in database`);

  // 3. Seed 5 distinct professional users
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const peopleData = [
    {
      email: "liam.vance@example.com",
      username: "liam_arch",
      name: "Liam Vance",
      bio: "Principal Systems Architect exploring distributed resilience, high-throughput pipelines, and event-driven backends.",
      avatar: "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=300",
      planId: proPlan.id,
      interests: ["architecture", "backend", "systemdesign", "cloud"],
    },
    {
      email: "priya.sharma@example.com",
      username: "priya_cloud",
      name: "Priya Sharma",
      bio: "Cloud & Infrastructure Engineer focused on Kubernetes orchestration, cost optimization, and developer productivity platforms.",
      avatar: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=300",
      planId: proPlan.id,
      interests: ["cloud", "devops", "architecture", "performance"],
    },
    {
      email: "marcus.chen@example.com",
      username: "marcus_sec",
      name: "Marcus Chen",
      bio: "Security Researcher & AppSec Lead breaking down zero-trust patterns, cryptography, WebAuthn, and API defense.",
      avatar: "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=300",
      planId: freePlan.id,
      interests: ["security", "backend", "technology", "programming"],
    },
    {
      email: "chloe.dubois@example.com",
      username: "chloe_ui",
      name: "Chloe Dubois",
      bio: "Design Technologist crafting fluid web interfaces with React, CSS architecture, web performance, and strict WCAG accessibility.",
      avatar: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=300",
      planId: freePlan.id,
      interests: ["frontend", "design", "performance", "webdev"],
    },
    {
      email: "julian.morales@example.com",
      username: "julian_db",
      name: "Julian Morales",
      bio: "Data Systems Engineer solving indexing bottlenecks, high-concurrency ACID transactions, and distributed caching topologies.",
      avatar: "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=300",
      planId: proPlan.id,
      interests: ["database", "backend", "performance", "architecture"],
    },
  ];

  const createdUsers: Array<{ id: string; username: string }> = [];

  for (const person of peopleData) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        username: person.username,
        bio: person.bio,
        avatar: person.avatar,
        planId: person.planId,
        hasOnboarded: true,
      },
      create: {
        email: person.email,
        username: person.username,
        passwordHash,
        name: person.name,
        bio: person.bio,
        avatar: person.avatar,
        planId: person.planId,
        hasOnboarded: true,
      },
    });

    createdUsers.push(user);

    for (const tag of person.interests) {
      const tagObj = tagMap[tag];
      if (tagObj) {
        await prisma.interest.upsert({
          where: {
            userId_tagId: {
              userId: user.id,
              tagId: tagObj.id,
            },
          },
          update: {},
          create: {
            userId: user.id,
            tagId: tagObj.id,
          },
        });
      }
    }
  }

  console.log(`✓ ${createdUsers.length} Users seeded with avatar images and interests`);

  // 4. Seed Follow Relationships (each user follows at least 2 people)
  const followPairs: Array<[number, number]> = [
    [0, 1], // Liam -> Priya
    [0, 2], // Liam -> Marcus
    [1, 0], // Priya -> Liam
    [1, 3], // Priya -> Chloe
    [2, 0], // Marcus -> Liam
    [2, 4], // Marcus -> Julian
    [3, 1], // Chloe -> Priya
    [3, 0], // Chloe -> Liam
    [4, 2], // Julian -> Marcus
    [4, 1], // Julian -> Priya
  ];

  for (const [followerIdx, followingIdx] of followPairs) {
    const follower = createdUsers[followerIdx]!;
    const following = createdUsers[followingIdx]!;
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

  console.log(`✓ ${followPairs.length} Follow relations created across users`);

  // 5. Seed 5 Posts per Person (25 total posts) with >200 words each
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  const postsData = [
    // --- Liam Vance (5 posts) ---
    {
      authorIdx: 0,
      postNum: 1,
      title: "Designing Resilient Multi-Region Microservices in 2026",
      coverImage: "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 6,
      readingTime: 5,
      tagNames: ["architecture", "backend", "cloud"],
      blocks: [
        { type: "paragraph", text: "Building resilient distributed systems across geographical borders requires shifting our architectural philosophy from complete failure prevention to seamless, graceful degradation. When network partitions occur across transatlantic clusters, your core application must not grind to an immediate halt. Instead, local regions should be equipped to handle read traffic and critical write operations independently, queueing non-blocking synchronization events for eventual consistency once cross-region links are restored." },
        { type: "heading", text: "Active-Active Topologies and Graceful Degradation", level: 2 },
        { type: "paragraph", text: "One critical pattern we adopted involves active-active regional routing backed by intelligent DNS failover and edge termination. By using lightweight health checks that evaluate downstream database latency rather than mere HTTP ping responses, global traffic managers can divert user requests around compromised availability zones in under three seconds. This architectural agility prevents catastrophic cascading timeouts across dependent upstream services." },
        { type: "quote", text: "Resiliency is not a static state of code; it is an active discipline proven through continuous failure rehearsals under realistic network strain." },
        { type: "heading", text: "Core Architectural Patterns", level: 3 },
        { type: "bullet", text: "Data persistence across multi-region configurations introduces the classic CAP theorem trade-offs that cannot be abstracted away. We partition our domain entities into strongly consistent data (such as financial transactions and authentication states) and causally consistent data (such as user feed updates and analytics events). Strongly consistent models leverage consensus algorithms like Raft within a primary regional cluster, while secondary regions read from high-performance read replicas with asynchronous streaming replication." },
        { type: "bullet", text: "Ultimately, operational excellence in multi-region environments is won or lost during automated failure rehearsals. Conducting regular automated chaos engineering drills\u2014such as deliberately severing interconnect backbones or terminating regional gateways during production hours\u2014builds organizational confidence. Resiliency is not a static state of code; it is a discipline proven through active, continuous validation under realistic network strain." }
      ],
    },
    {
      authorIdx: 0,
      postNum: 2,
      title: "Why We Abandoned Complex Message Brokers for Postgres LISTEN/NOTIFY",
      coverImage: "https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 18,
      readingTime: 4,
      tagNames: ["architecture", "database", "backend"],
      blocks: [
        { type: "paragraph", text: "In modern backend engineering, teams frequently introduce dedicated message brokers such as RabbitMQ or Apache Kafka before their workload genuinely necessitates that level of infrastructure overhead. Operating a clustered broker requires dedicated monitoring, complex partition rebalancing, specialized client libraries, and separate disaster recovery playbooks. For dozens of mid-sized microservices, this added complexity frequently introduces more operational fragility than it resolves." },
        { type: "heading", text: "Postgres LISTEN/NOTIFY vs Dedicated Broker Clusters", level: 2 },
        { type: "paragraph", text: "For our event-driven notifications and internal job dispatching, we transitioned to PostgreSQL native LISTEN and NOTIFY primitives combined with an outbox pattern table. Because the business transaction and the corresponding outbox record commit atomically within the exact same relational database transaction, the notorious dual-write dilemma is solved at the root level without requiring distributed two-phase commit protocols." },
        { type: "quote", text: "Solving the dual-write dilemma at the relational database level eliminates the need for complex distributed two-phase commit protocols." },
        { type: "heading", text: "Benefits Over Traditional Message Queues", level: 3 },
        { type: "bullet", text: "A lightweight background daemon polls the outbox table or listens directly on dedicated notification channels to dispatch events over persistent WebSocket or Server-Sent Events connections. PostgreSQL easily handles thousands of notifications per second with single-digit millisecond latency, consuming trivial CPU overhead while benefiting from existing connection pooling and automated backups." },
        { type: "bullet", text: "While Kafka remains indispensable for high-volume telemetry ingestion exceeding hundreds of thousands of events per second, teams handling typical web-scale workloads should thoughtfully consider whether a battle-tested relational database already possesses the concurrency features they need before introducing another distributed dependency into their production stack." }
      ],
    },
    {
      authorIdx: 0,
      postNum: 3,
      title: "The Pragmatic Architect's Guide to Domain-Driven Design",
      coverImage: "https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 42,
      readingTime: 5,
      tagNames: ["architecture", "systemdesign", "programming"],
      blocks: [
        { type: "paragraph", text: "Domain-Driven Design (DDD) often suffers from an unfortunate paradox: while its strategic concepts provide transformative clarity for complex software systems, its tactical patterns are frequently cargo-culted into unreadable, bloated enterprise boilerplate. Engineers often rush to create dozens of repository interfaces, value object wrappers, and aggregate roots for simple CRUD operations where straightforward procedural services would have served the business far better." },
        { type: "heading", text: "Strategic Design over Tactical Boilerplate", level: 2 },
        { type: "paragraph", text: "Strategic design is where the true value of DDD resides. Defining clear Bounded Contexts and establishing a shared Ubiquitous Language between product stakeholders and engineering teams eliminates the costly linguistic ambiguity that sabotages software projects. When terms like 'Customer', 'Account', and 'Order' have explicit, bounded definitions within their respective domain boundaries, integration contracts become straightforward and self-documenting." },
        { type: "quote", text: "A domain-driven implementation that doubles code surface area without improving clarity is a failure of pragmatic engineering." },
        { type: "heading", text: "Essential Domain Invariants", level: 3 },
        { type: "bullet", text: "When implementing tactical patterns, pragmatism must govern every architectural choice. We reserve formal Aggregate boundaries and Domain Events exclusively for the core domain\u2014the proprietary business logic that directly drives business revenue and differentiation. Supporting domains and generic subdomains are kept lean and unencumbered by unnecessary abstraction layers." },
        { type: "bullet", text: "Remember that software architecture exists solely to facilitate predictable, sustainable business delivery. A DDD implementation that doubles code surface area without improving testability or domain clarity is a failure of pragmatic engineering. Keep your domain models clean, guard your invariants strictly at aggregate boundaries, and resist the temptation to over-abstract simple data pipelines." }
      ],
    },
    {
      authorIdx: 0,
      postNum: 4,
      title: "Taming Distributed Transactions: Sagas vs Two-Phase Commit in Practice",
      coverImage: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 70,
      readingTime: 4,
      tagNames: ["architecture", "backend", "systemdesign"],
      blocks: [
        { type: "paragraph", text: "When splitting a monolithic database into isolated services, the loss of ACID transactions across service boundaries is often the most painful architectural shock. The initial impulse of many teams is to implement distributed Two-Phase Commit (2PC) or XA transactions to simulate monolithic guarantees across the network. In practice, 2PC creates severe latency amplification and dangerous holding of locks across distributed nodes." },
        { type: "heading", text: "Decomposing Transactions with Orchestrated Sagas", level: 2 },
        { type: "paragraph", text: "The Saga pattern offers a far more resilient alternative by decomposing a global distributed transaction into a sequence of local transactions. Each participating service updates its local database and publishes an event or message to trigger the next step. If a downstream step fails due to business validation or infrastructure failure, the saga orchestrator executes compensating transactions backwards to restore system consistency." },
        { type: "quote", text: "Orchestration-based sagas provide significantly better observability and debuggability than choreography-based alternatives for non-trivial workflows." },
        { type: "heading", text: "Compensating Action Guarantees", level: 3 },
        { type: "bullet", text: "We have found that orchestration-based sagas provide significantly better observability and debuggability than choreography-based alternatives for non-trivial workflows. Having a centralized state machine that tracks the current execution stage, pending retries, and compensation logs allows on-call engineers to immediately diagnose stuck orders or reconciliation anomalies during incident response." },
        { type: "bullet", text: "Designing effective compensating actions requires embracing idempotency as a non-negotiable invariant. Every local transaction and compensation handler must be completely safe to execute multiple times with identical payloads. Employing idempotency keys backed by unique database indexes ensures that transient network retries never lead to duplicate charges or phantom inventory updates." }
      ],
    },
    {
      authorIdx: 0,
      postNum: 5,
      title: "Zero-Downtime Database Migrations: The Expand and Contract Pattern",
      coverImage: "https://images.pexels.com/photos/1181354/pexels-photo-1181354.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 98,
      readingTime: 5,
      tagNames: ["architecture", "database", "backend"],
      blocks: [
        { type: "paragraph", text: "In production environments serving continuous web traffic, scheduled maintenance maintenance windows for database migrations are an obsolete relic of the past. Modern agile deployments require that database schema modifications and application code releases occur completely decoupled from one another without dropping a single active customer query or locking production tables." },
        { type: "heading", text: "The Three-Phase Expand and Contract Strategy", level: 2 },
        { type: "paragraph", text: "The Expand and Contract pattern (also known as parallel run or transition phase) breaks breaking schema modifications into multiple non-breaking steps. When renaming a critical column, the first deployment expands the database schema by adding the new column as nullable alongside the existing one, with dual-writing enabled in application services or database triggers." },
        { type: "quote", text: "Scheduled maintenance windows for database schema migrations are an obsolete relic of the past in continuous deployment environments." },
        { type: "heading", text: "Migration Safety Rules", level: 3 },
        { type: "bullet", text: "The second phase backfills existing historical records asynchronously in small, throttled batches to avoid saturating database I/O and transaction log disk space. Once backfilling finishes and validation scripts confirm parity across both columns, application read queries are safely shifted to reference the new column exclusively." },
        { type: "bullet", text: "Only after the updated application code has operated stably in production for several days does the final contract migration execute, safely dropping the deprecated column and its legacy indexes. This disciplined phased methodology eliminates downtime and ensures that any rollback of application code remains completely safe and backwards-compatible." },
        { type: "paragraph", text: "Automated CI/CD integration plays a pivotal role in enforcing this migration discipline. We integrate migration linter checks into pull requests to reject any schema migration attempting an unsafe column drop, non-concurrent index creation, or synchronous table rewrite on active tables. By standardizing these rules, engineers can ship migrations with absolute confidence." }
      ],
    },

    // --- Priya Sharma (5 posts) ---
    {
      authorIdx: 1,
      postNum: 6,
      title: "Mastering Kubernetes Pod Autoscaling with Custom Prometheus Metrics",
      coverImage: "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 8,
      readingTime: 5,
      tagNames: ["cloud", "devops", "performance"],
      blocks: [
        { type: "paragraph", text: "Standard Kubernetes Horizontal Pod Autoscalers (HPA) rely on CPU and memory utilization thresholds to scale container replicas. However, for modern asynchronous web workloads and event consumers, CPU saturation is often a lagging indicator that triggers scaling long after user request queues have already built up unacceptable latency spikes." },
        { type: "heading", text: "Leading Metrics vs Lagging Resource Saturation", level: 2 },
        { type: "paragraph", text: "By integrating the Prometheus Adapter and KEDA (Kubernetes Event-driven Autoscaling), clusters can scale workloads based on immediate leading indicators\u2014such as Redis queue depth, Kafka lag, or HTTP request rates per second. When an incoming marketing spike or batch job floods the queue, the autoscaler adds worker pods before queue processing times degrade." },
        { type: "quote", text: "CPU saturation is frequently a lagging indicator that triggers scaling long after user request queues have already built up unacceptable latency." },
        { type: "heading", text: "Autoscaling Optimization Checklist", level: 3 },
        { type: "bullet", text: "Configuring stabilization windows and downscale behavior is equally vital to prevent pod thrashing. Rapidly scaling down during intermittent dips in traffic creates unnecessary cold-start overhead and can disrupt in-flight HTTP requests. We configure smooth downscale rate limiting to maintain buffer capacity during volatile traffic patterns." },
        { type: "bullet", text: "Pairing custom metric autoscaling with cluster autoscalers or cloud-native node provisioners (like Karpenter) ensures that compute infrastructure scales in lockstep with pod demands. This synergy delivers optimal response times during peak demand while drastically trimming unneeded compute instances during quiet hours." },
        { type: "paragraph", text: "In addition to scaling based on queue depth, correlating autoscaling thresholds with end-to-end user response percentiles (p95 and p99) guarantees service-level objectives remain uncompromised. When latency begins climbing above acceptable thresholds, preemptive pod scheduling mitigates traffic shock before users ever experience dropped connections or degraded experiences." }
      ],
    },
    {
      authorIdx: 1,
      postNum: 7,
      title: "Cutting AWS Cloud Spend by 40% Without Sacrificing Reliability",
      coverImage: "https://images.pexels.com/photos/3182773/pexels-photo-3182773.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 24,
      readingTime: 4,
      tagNames: ["cloud", "devops", "productivity"],
      blocks: [
        { type: "paragraph", text: "Cloud cost optimization is frequently treated as an emergency audit performed once an executive receives an alarming monthly invoice. In reality, sustainable cloud economics requires embedding cost observability directly into continuous delivery pipelines and infrastructure design from day one." },
        { type: "heading", text: "Sustainable Cloud Economics and FinOps Alignment", level: 2 },
        { type: "paragraph", text: "Our single largest financial breakthrough came from strategically utilizing Graviton ARM-based EC2 instances across our compute tiers. Migrating our Node.js and Go microservices to ARM architecture provided an instantaneous 20% price-to-performance enhancement with zero code modifications beyond building multi-architecture container images via Docker Buildx." },
        { type: "quote", text: "Sustainable cloud economics requires embedding cost observability directly into continuous delivery pipelines and architecture from day one." },
        { type: "heading", text: "High-Impact Cost Reduction Levers", level: 3 },
        { type: "bullet", text: "Next, we aggressively restructured our staging and preview environments. By leveraging automated scheduled shutdowns outside working hours and aggressive lifecycle rules on non-production S3 buckets and container registries, we slashed idle non-production spending by more than half." },
        { type: "bullet", text: "Finally, pairing Amazon Savings Plans with Spot instances for fault-tolerant background worker queues unlocked deep discounts. Investing in proper FinOps instrumentation ensures that every engineering team receives transparent visibility into their service-level cloud costs, fostering an engineering culture of resource mindfulness." },
        { type: "paragraph", text: "Another often-overlooked lever is optimizing network egress and inter-availability-zone data transfer costs. By co-locating tightly coupled microservices within the same availability zone and utilizing VPC endpoints for internal AWS services like S3 and DynamoDB, we eliminated thousands of dollars in hidden cross-AZ networking fees every single month." }
      ],
    },
    {
      authorIdx: 1,
      postNum: 8,
      title: "Demystifying Zero-Trust Networking for Modern Cloud Workloads",
      coverImage: "https://images.pexels.com/photos/3861958/pexels-photo-3861958.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 48,
      readingTime: 5,
      tagNames: ["cloud", "security", "devops"],
      blocks: [
        { type: "paragraph", text: "The traditional castle-and-moat security model assumed that everything inside a corporate VPN or private Virtual Private Cloud (VPC) was inherently trustworthy, while the public internet was hostile. In modern distributed cloud topologies, this perimeter-based assumption is dangerous. Once an attacker breaches a single perimeter node, flat internal networks allow unimpeded lateral movement across databases and internal APIs." },
        { type: "heading", text: "Rethinking the Castle-and-Moat Security Model", level: 2 },
        { type: "paragraph", text: "Zero-Trust Architecture flips this premise entirely: never trust, always verify. Every interaction between microservices\u2014whether across regions or within the same Kubernetes node\u2014must be explicitly authenticated, strictly authorized, and cryptographically encrypted in transit using mutual TLS (mTLS)." },
        { type: "quote", text: "Zero-Trust flips the premise entirely: never trust, always verify every interaction regardless of network topology." },
        { type: "heading", text: "Foundational Implementation Pillars", level: 3 },
        { type: "bullet", text: "Implementing modern service meshes like Istio or Envoy-based sidecars enables automated mTLS certificate rotation and workload identity management via SPIFFE/SPIRE without forcing developers to implement complex cryptographic handshakes in application code. Ephemeral cryptographic identities ensure that compromised credentials cannot be reused indefinitely." },
        { type: "bullet", text: "Transitioning to zero-trust networking requires patience and phased rollouts. Starting with permissive mTLS mode allows teams to map internal service dependencies and audit traffic patterns before enforcing strict authorization policies. The result is a resilient infrastructure perimeter where defense-in-depth is the default reality." },
        { type: "paragraph", text: "Crucially, zero-trust networking extends beyond infrastructure communication into developer workstations and internal administrative tooling. Enforcing hardware-bound passkeys, device health compliance checks, and short-lived session credentials ensures that even stolen laptop credentials cannot compromise production control planes or customer databases." }
      ],
    },
    {
      authorIdx: 1,
      postNum: 9,
      title: "Building Observable Cloud Pipelines with OpenTelemetry and Jaeger",
      coverImage: "https://images.pexels.com/photos/546819/pexels-photo-546819.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 78,
      readingTime: 5,
      tagNames: ["cloud", "devops", "performance"],
      blocks: [
        { type: "paragraph", text: "Distributed tracing is no longer a luxury reserved for tech giants; it is a foundational prerequisite for diagnosing multi-service microservice architectures. When a user requests an API endpoint that orchestrates calls across four downstream services and two databases, traditional siloed log files make finding the root cause of an anomalous 500ms delay nearly impossible." },
        { type: "heading", text: "Unifying Telemetry with OpenTelemetry Standards", level: 2 },
        { type: "paragraph", text: "OpenTelemetry has unified the observability ecosystem by establishing vendor-neutral standards for traces, metrics, and logs. By instrumenting standard HTTP client middleware, database drivers, and messaging producers with OpenTelemetry auto-instrumentation, distributed context propagation headers (W3C TraceContext) traverse every service boundary automatically." },
        { type: "quote", text: "Distributed tracing is no longer a luxury reserved for tech giants; it is a prerequisite for diagnosing modern multi-service architectures." },
        { type: "heading", text: "Observability Instrumentation Guidelines", level: 3 },
        { type: "bullet", text: "Visualizing these trace spans in Jaeger immediately reveals latency bottlenecks, redundant database queries, and hidden serial request cascades. Engineers can pinpoint the exact microsecond where a database query blocked waiting on a connection pool or where a remote third-party API timed out." },
        { type: "bullet", text: "Effective tracing also requires disciplined sampling strategies to balance deep operational insight with manageable storage costs. Implementing tail-based sampling in OpenTelemetry Collectors allows you to retain 100% of error traces and slow requests while sampling down redundant healthy traces, preserving high diagnostic value at predictable cost." },
        { type: "paragraph", text: "Correlating distributed traces with structured application logs through automatic trace and span ID injection elevates debugging from speculation to certainty. When an anomaly occurs, developers can click directly from an error alert into the corresponding Jaeger trace visualization, seeing the exact execution path and variable state across all microservices." }
      ],
    },
    {
      authorIdx: 1,
      postNum: 10,
      title: "Terraform vs Pulumi: Our Experience Managing 50+ Cloud Environments",
      coverImage: "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 110,
      readingTime: 4,
      tagNames: ["cloud", "devops", "architecture"],
      blocks: [
        { type: "paragraph", text: "Infrastructure as Code (IaC) is the bedrock of modern cloud reliability. For years, HashiCorp's Terraform and its declarative HCL domain-specific language served as the uncontested industry benchmark. However, as our infrastructure scaled across multi-tenant clusters, dynamic preview environments, and complex networking policies, HCL began showing ergonomic friction." },
        { type: "heading", text: "Declarative HCL vs General-Purpose Programming Languages", level: 2 },
        { type: "paragraph", text: "Evaluating Pulumi allowed our engineering teams to write cloud definitions directly in TypeScript and Python, unlocking familiar programming language primitives: loops, conditionals, strong typing, package managers, and standard unit test frameworks. Being able to run integration tests using Jest or PyTest against real infrastructure schemas drastically reduced deployment mistakes." },
        { type: "quote", text: "Terraform excels for immutable core foundations, while Pulumi shines for dynamic application-level cloud resources where developer velocity matters." },
        { type: "heading", text: "Infrastructure Evaluation Dimensions", level: 3 },
        { type: "bullet", text: "However, Terraform still maintains significant advantages in its massive community module ecosystem, battle-tested state file reliability, and strict declarative boundaries that discourage engineers from embedding unpredictable procedural logic into infrastructure definitions." },
        { type: "bullet", text: "Our conclusion after managing 50+ production environments: Terraform excels for core foundational infrastructure (VPCs, IAM, base networking) where simplicity and strict immutability are paramount. Pulumi shines brightly for dynamic application-level cloud resources (Kubernetes workloads, serverless pipelines, microservice bindings) where developer velocity and programmatic composability deliver immense value." },
        { type: "paragraph", text: "A critical lesson from our multi-environment management was establishing standardized module boundaries. Regardless of whether an organization chooses Terraform or Pulumi, defining opinionated, security-approved modules for VPCs, database clusters, and Kubernetes nodes prevents configuration drift and accelerates team onboarding significantly." }
      ],
    },

    // --- Marcus Chen (5 posts) ---
    {
      authorIdx: 2,
      postNum: 11,
      title: "Hardening Node.js and Express APIs Against the OWASP Top Ten",
      coverImage: "https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 10,
      readingTime: 5,
      tagNames: ["security", "backend", "webdev"],
      blocks: [
        { type: "paragraph", text: "Building production-grade web APIs in Node.js and Express requires adopting a rigorous security posture from the first line of code. The flexibility of JavaScript makes rapid prototyping a joy, but that same flexibility frequently leaves unvalidated input paths, vulnerable prototype pollution vectors, and loose authentication boundaries open to malicious exploitation." },
        { type: "heading", text: "Defensive Architecture at Application Boundaries", level: 2 },
        { type: "paragraph", text: "Input validation at every trust boundary is your primary line of defense. By enforcing strict schemas using libraries like Zod on every incoming request body, query parameter, and route parameter, malformed data structures and unexpected object injections are rejected before touching your controllers or ORM layer." },
        { type: "quote", text: "Input validation at every trust boundary is your primary line of defense against malformed payloads and prototype injection vectors." },
        { type: "heading", text: "OWASP Hardening Checklist", level: 3 },
        { type: "bullet", text: "Security headers must never be overlooked. Configuring Helmet with fine-tuned Content Security Policies (CSP), strict HSTS preloading, X-Content-Type-Options, and disabling the telltale X-Powered-By header mitigates widespread cross-site scripting and MIME-sniffing attacks. Combined with sliding-window Redis rate limiting on sensitive authentication and payment endpoints, you prevent automated brute-force attacks from exhausting server resources." },
        { type: "bullet", text: "Finally, ensure that all internal database interactions leverage parameterized queries through proven ORMs like Prisma, preventing SQL injection vulnerabilities. Security is not an isolated checklist item; it is an architectural contract maintained throughout every sprint." },
        { type: "paragraph", text: "Additionally, auditing asynchronous exception handling and unhandled promise rejections prevents server worker crashes that lead to denial-of-service vulnerabilities. Wrapping asynchronous routes in robust error middleware and maintaining structured JSON logging provides full visibility into anomalous attack vectors without leaking sensitive stack traces to callers." }
      ],
    },
    {
      authorIdx: 2,
      postNum: 12,
      title: "Implementing Passkeys and WebAuthn: Lessons from Replacing Passwords",
      coverImage: "https://images.pexels.com/photos/1181298/pexels-photo-1181298.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 30,
      readingTime: 5,
      tagNames: ["security", "webdev", "frontend"],
      blocks: [
        { type: "paragraph", text: "Passwords remain the single greatest vulnerability vector in modern consumer and enterprise web applications. Users routinely reuse predictable credentials across platforms, while phishing kits successfully bypass SMS and email-based two-factor authentication with alarming sophistication." },
        { type: "heading", text: "Cryptographic Authentication with FIDO2 and WebAuthn", level: 2 },
        { type: "paragraph", text: "Passkeys, powered by the W3C WebAuthn standard and FIDO2 alliance, offer a cryptographic, phishing-resistant alternative. Leveraging public-key cryptography and device-bound biometric authenticators (such as Apple Touch ID, Face ID, or Windows Hello), private keys never leave the user's secure enclave, completely neutralizing credential stuffing and database breach leaks." },
        { type: "quote", text: "By removing shared secrets from the authentication equation entirely, the attack surface shifts from vulnerable databases to personal hardware enclaves." },
        { type: "heading", text: "Passkey Rollout Considerations", level: 3 },
        { type: "bullet", text: "During our rollout, designing an intuitive fallback experience was the most nuanced engineering challenge. Supporting cross-device authentication via QR codes, managing synced passkeys through cloud password managers, and providing clean recovery flows for lost hardware devices are critical to ensuring non-technical users never find themselves permanently locked out." },
        { type: "bullet", text: "The metrics from our deployment were undeniable: authentication completion times dropped by over 70%, login failure rates dropped to near zero, and user complaints regarding password resets vanished entirely. Passkeys represent the defining authentication milestone of this decade." },
        { type: "paragraph", text: "From an enterprise perspective, supporting Passkeys also drastically diminishes operational overhead associated with customer account recovery and credential stuffing mitigation. By removing shared secrets from the authentication equation entirely, the attack surface shifts from vulnerable centralized databases to secure personal cryptographic hardware." }
      ],
    },
    {
      authorIdx: 2,
      postNum: 13,
      title: "Defending Against Supply Chain Attacks in the Modern JavaScript Ecosystem",
      coverImage: "https://images.pexels.com/photos/3861972/pexels-photo-3861972.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 54,
      readingTime: 4,
      tagNames: ["security", "programming", "devops"],
      blocks: [
        { type: "paragraph", text: "A typical modern web application depends directly and transitively on thousands of open-source packages pulled from npm registries. While this open-source velocity has revolutionized developer productivity, it has simultaneously turned package registries into prime targets for sophisticated supply chain attacks." },
        { type: "heading", text: "Proactive Defense in Package Dependency Trees", level: 2 },
        { type: "paragraph", text: "Recent attacks have demonstrated malicious actors purchasing abandoned packages, hijacking maintainer credentials, or subtly publishing typosquatted variants to inject obfuscated data-harvesting payloads into production bundles. Trusting lockfiles blindly is no longer sufficient for security-conscious engineering organizations." },
        { type: "quote", text: "Trusting lockfiles blindly is no longer sufficient for security-conscious engineering organizations in the open-source ecosystem." },
        { type: "heading", text: "Supply Chain Protection Protocols", level: 3 },
        { type: "bullet", text: "We instituted automated dependency scanning using tools like Socket and automated SBOM (Software Bill of Materials) generation in our CI/CD pipelines. These tools inspect package network activity, install-script behaviors, and filesystem access permissions before permitting a dependency bump into the main codebase." },
        { type: "bullet", text: "Furthermore, disabling npm post-install lifecycle scripts by default (`--ignore-scripts`) and enforcing pinned cryptographic checksums ensures that unexpected package tampering is caught before arbitrary code executes in build runners or production runtime containers." },
        { type: "paragraph", text: "Another vital defense mechanism is leveraging private npm artifact proxies that enforce package quarantine policies. Newly published packages or version bumps undergo an automatic 48-hour holding period while automated vulnerability scanners and security researchers evaluate the release, protecting internal production builds from zero-day compromises. Coupling quarantine mechanisms with strict semantic version locking guarantees that builds remain completely deterministic, reproducible, and impervious to rogue upstream modifications." }
      ],
    },
    {
      authorIdx: 2,
      postNum: 14,
      title: "Zero-Trust Architecture: Why Perimeter Security Is Completely Obsolete",
      coverImage: "https://images.pexels.com/photos/270348/pexels-photo-270348.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 82,
      readingTime: 5,
      tagNames: ["security", "architecture", "cloud"],
      blocks: [
        { type: "paragraph", text: "The legacy assumption that internal corporate networks are safe spaces has been repeatedly dismantled by high-profile modern security breaches. Once an attacker obtains compromised VPN credentials or exploits an unpatched internal intranet service, flat networking topologies permit unrestricted lateral movement." },
        { type: "heading", text: "Beyond the Perimeter: Least-Privilege by Default", level: 2 },
        { type: "paragraph", text: "Zero-Trust Architecture discards the concept of trusted internal networks. Under this framework, every request, API call, and database interaction must independently authenticate and authorize the requester, regardless of whether the traffic originates from the public internet or an adjacent server rack in a private datacenter." },
        { type: "quote", text: "When security controls are applied consistently at the application and data layer, perimeter compromises no longer equate to catastrophic enterprise breaches." },
        { type: "heading", text: "Access Control Guarantees", level: 3 },
        { type: "bullet", text: "Implementing fine-grained Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) powered by short-lived cryptographic tokens ensures least-privilege access across all digital assets. Tokens should carry strictly scoped permissions and undergo immediate revocation when anomalous behavior is detected." },
        { type: "bullet", text: "Adopting Zero-Trust requires continuous verification across identity, endpoint health, and network telemetry. When security controls are applied consistently at the application and data layer, perimeter compromises no longer equate to catastrophic enterprise-wide data breaches." },
        { type: "paragraph", text: "Ultimately, zero-trust is as much about cultural mindset as it is about technology. Adopting least-privilege principles, continuous telemetry auditing, and assuming breach conditions transforms organizational engineering into a proactive discipline that contains blast radiuses before small vulnerabilities can escalate into catastrophic security events." }
      ],
    },
    {
      authorIdx: 2,
      postNum: 15,
      title: "Cryptographic Key Management and Secure Session Storage at Scale",
      coverImage: "https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 115,
      readingTime: 5,
      tagNames: ["security", "backend", "database"],
      blocks: [
        { type: "paragraph", text: "Handling user sessions and cryptographic keys in high-scale distributed applications requires balancing rapid read validation performance against rigorous security guarantees. Storing raw session identifiers or plaintext tokens in databases exposes systems to catastrophic credential harvesting if a database snapshot or replica is compromised." },
        { type: "heading", text: "High-Entropy Session Tokens and Salted Hashes", level: 2 },
        { type: "paragraph", text: "In our authentication architecture, session tokens generated on the server are high-entropy cryptographically random strings. The client receives the raw token over a secure, HTTP-only, SameSite cookie, while the database and Redis cache exclusively store a salted SHA-256 hash of that token. Even in the event of an unauthorized database dump, attacker cannot forge valid session cookies." },
        { type: "quote", text: "Even in the event of an unauthorized database snapshot dump, salted SHA-256 token hashing guarantees that attackers cannot forge valid session cookies." },
        { type: "heading", text: "Key Lifecycle Management Rules", level: 3 },
        { type: "bullet", text: "Cryptographic keys used for signing JWTs or encrypting sensitive user data at rest must follow strict automated key rotation cycles managed through Hardware Security Modules (HSM) or cloud KMS services. Envelope encryption ensures that data encryption keys (DEK) can be rotated frequently without re-encrypting massive historical datasets." },
        { type: "bullet", text: "Building a resilient session management infrastructure also involves implementing immediate multi-device revocation and concurrent session tracking. Giving users clear insight into their active device sessions and the power to terminate unrecognized connections with one click is essential for modern account safety." },
        { type: "paragraph", text: "To ensure high availability during key rotation events, systems must support dual-key verification during transitional deployment windows. Services should verify existing tokens against the prior active key while signing all newly issued tokens with the upgraded key version, ensuring seamless, non-disruptive rolling updates across global clusters." }
      ],
    },

    // --- Chloe Dubois (5 posts) ---
    {
      authorIdx: 3,
      postNum: 16,
      title: "Mastering Fluid Typography and Container Queries in Tailwind CSS v4",
      coverImage: "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 12,
      readingTime: 4,
      tagNames: ["frontend", "design", "webdev"],
      blocks: [
        { type: "paragraph", text: "Responsive web design has matured far beyond relying solely on global viewport breakpoints like 640px or 1024px. Modern web interfaces are composed of reusable, modular components that may appear in wide main editorial columns, compact sidebar widgets, or mobile sliding drawers." },
        { type: "heading", text: "Component-First Adaptability with Container Queries", level: 2 },
        { type: "paragraph", text: "Container queries allow UI elements to adapt their typography, padding, and layout based strictly on the available width of their immediate parent container rather than the global browser window. With Tailwind CSS v4 native container query support, styling complex adaptive card components becomes remarkably concise and intuitive." },
        { type: "quote", text: "When a story card or author bio knows how to format itself in any container context, design velocity increases while CSS maintenance overhead drops." },
        { type: "heading", text: "Fluid Layout Best Practices", level: 3 },
        { type: "bullet", text: "Combining container queries with CSS clamp() fluid typography produces headline text and line heights that scale proportionally without abrupt, awkward font-size jumps across screen transitions. Reading experiences feel deliberate, balanced, and editorial regardless of the reader's device dimensions." },
        { type: "bullet", text: "Embracing container-first design empowers frontend developers to build component design systems that are genuinely self-contained. When a story card or author bio knows how to format itself in any context, design velocity increases dramatically while CSS maintenance overhead drops." },
        { type: "paragraph", text: "Testing container queries across varied viewport dimensions requires thoughtful responsive testing strategies. By testing components inside resizable preview harnesses rather than solely resizing full browser windows, UI engineers ensure that cards and widgets render flawlessly across unexpected sidebar layouts, split-views, and compact embedded dialogs." }
      ],
    },
    {
      authorIdx: 3,
      postNum: 17,
      title: "The Architecture Behind 60 FPS Web Animations and View Transitions",
      coverImage: "https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 36,
      readingTime: 5,
      tagNames: ["frontend", "performance", "webdev"],
      blocks: [
        { type: "paragraph", text: "Silky-smooth 60 frames-per-second animations are the defining hallmark of polished digital products. Yet, web animations frequently stutter and drop frames when engineers trigger expensive browser layout recalculations and paint operations by animating properties like width, height, top, or margin." },
        { type: "heading", text: "GPU Compositor Acceleration and View Transitions", level: 2 },
        { type: "paragraph", text: "Achieving consistent hardware-accelerated animations requires strictly limiting animation properties to transform and opacity. These properties are handled entirely by the GPU compositor thread, freeing the main JavaScript execution thread to handle user input events without inducing UI jank." },
        { type: "quote", text: "Limiting animation properties to transform and opacity frees the main JavaScript thread to handle user input without inducing UI jank." },
        { type: "heading", text: "Animation Performance Benchmarks", level: 3 },
        { type: "bullet", text: "The modern View Transitions API takes web fluidity to the next level by enabling seamless morphing transitions between different DOM states and multi-page navigations. Instead of abrupt page refreshes, hero images smoothly expand into article headers and list items glide into view with minimal CSS declarations." },
        { type: "bullet", text: "Performance optimization is not complete without honoring user preferences. Wrapping transitions in the prefers-reduced-motion media query ensures that users with vestibular sensitivities enjoy instant, static view transitions without discomfort. Accessibility and aesthetic elegance must always go hand in hand." },
        { type: "paragraph", text: "Profiling animations using Chrome DevTools Performance panel and rendering overlays reveals invisible performance traps like unintended layer promotion and paint flashing. Keeping GPU memory usage lean while achieving continuous 60 FPS fluidity requires disciplined compositor inspection and avoiding unnecessary will-change property declarations." }
      ],
    },
    {
      authorIdx: 3,
      postNum: 18,
      title: "Accessibility Is Not an Afterthought: Building Inclusive UI Components",
      coverImage: "https://images.pexels.com/photos/577585/pexels-photo-577585.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 60,
      readingTime: 5,
      tagNames: ["frontend", "design", "webdev"],
      blocks: [
        { type: "paragraph", text: "Treating digital accessibility (a11y) as an optional post-launch audit is one of the most common mistakes in software development. Retrofitting screen reader semantics, keyboard navigation traps, and accessible color contrast ratios onto finished applications is significantly more difficult than building them correctly from inception." },
        { type: "heading", text: "Semantic HTML as the Foundation for Accessibility", level: 2 },
        { type: "paragraph", text: "Using semantic HTML elements as your foundation solves the vast majority of accessibility hurdles naturally. A native button element provides keyboard focusability, Enter and Space key activation, and accessible role announcements out of the box without requiring dozens of custom ARIA attributes." },
        { type: "quote", text: "Retrofitting screen reader semantics and focus traps onto finished apps is significantly harder than building them correctly from inception." },
        { type: "heading", text: "Inclusive Design Tenets", level: 3 },
        { type: "bullet", text: "When building complex custom widgets like dropdown menus, modal dialogs, and comboboxes, adhering to WAI-ARIA authoring practices is non-negotiable. Ensuring that focus trap managers correctly confine Tab navigation within active modals and restore focus to trigger elements upon dismissal creates an intuitive experience for assistive technology users." },
        { type: "bullet", text: "Automated linting and axe-core accessibility checks in continuous integration pipelines catch low-hanging fruit, but manual keyboard navigation testing and screen reader verification (VoiceOver, NVDA) are essential. Accessible software is simply higher quality software for every human being." },
        { type: "paragraph", text: "Creating an accessible culture also means integrating keyboard navigation testing directly into everyday code reviews. Ensuring that focus indicators remain unmistakably visible, touch targets measure at least 44 by 44 pixels, and interactive states communicate clearly across both light and dark themes transforms accessibility into a natural badge of craft." }
      ],
    },
    {
      authorIdx: 3,
      postNum: 19,
      title: "Optimizing Core Web Vitals: How We Cut LCP by 65% on Content Pages",
      coverImage: "https://images.pexels.com/photos/3861964/pexels-photo-3861964.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 88,
      readingTime: 5,
      tagNames: ["frontend", "performance", "webdev"],
      blocks: [
        { type: "paragraph", text: "Google's Core Web Vitals\u2014Largest Contentful Paint (LCP), Interaction to Next Paint (INP), and Cumulative Layout Shift (CLS)\u2014have aligned technical performance metrics directly with business user engagement and search visibility. High bounce rates on editorial platforms are almost always traceable to slow initial paint times and layout instability." },
        { type: "heading", text: "Optimizing the Critical Rendering Path and LCP", level: 2 },
        { type: "paragraph", text: "On content-heavy article pages, the hero cover image is almost universally the designated LCP candidate. By preloading the cover image with high fetchpriority, serving modern AVIF and WebP formats through an edge CDN, and reserving explicit aspect-ratio containers, our median LCP dropped from 3.2 seconds down to 1.1 seconds." },
        { type: "quote", text: "Keeping the browser main thread idle ensures that every tap, click, and keystroke responds instantly without perceptible delay." },
        { type: "heading", text: "Core Web Vitals Action Plan", level: 3 },
        { type: "bullet", text: "Eliminating layout shifts required auditing dynamic web fonts and third-party widgets. Leveraging modern font-display: swap with matched font-fallback metrics (size-adjust, ascent-override) prevented visual text reflow when custom serif headlines rendered over system fonts." },
        { type: "bullet", text: "To safeguard INP responsiveness, we decomposed monolithic client-side JavaScript bundles and deferred non-essential analytics tracking. Keeping the browser main thread idle ensures that every tap, click, and keystroke responds instantly without perceptible delay." },
        { type: "paragraph", text: "Continuous Real User Monitoring (RUM) is indispensable for ensuring Core Web Vitals improvements persist across subsequent software releases. By tracking field metrics from real users across different networks and hardware devices, regression alarms trigger immediately if a newly merged feature degrades LCP or introduces unexpected layout shifts." }
      ],
    },
    {
      authorIdx: 3,
      postNum: 20,
      title: "Designing Dark Mode That Feels Natural: Contrast, Elevation, and Surfaces",
      coverImage: "https://images.pexels.com/photos/1181275/pexels-photo-1181275.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 120,
      readingTime: 4,
      tagNames: ["frontend", "design", "webdev"],
      blocks: [
        { type: "paragraph", text: "Implementing an editorial dark mode is far more nuanced than running a naive color inversion or replacing pure white with pitch-black #000000. Pure black backgrounds create harsh visual contrast and eye fatigue when paired with pure white text, completely undermining the relaxed reading experience readers expect." },
        { type: "heading", text: "Surface Elevation, Contrast, and Halation Effects", level: 2 },
        { type: "paragraph", text: "A sophisticated dark theme utilizes subtle, deeply saturated dark grays or slate tones for background surfaces, with varying tints representing elevation and depth. Surface cards and dialogs elevated above the canvas receive subtly lighter backgrounds and faint borders rather than heavy drop shadows that become invisible in dark mode." },
        { type: "quote", text: "A sophisticated dark theme utilizes subtle, deeply saturated slate surfaces where elevation is represented by luminosity rather than drop shadows." },
        { type: "heading", text: "Dark Theme Palette Guidelines", level: 3 },
        { type: "bullet", text: "Typography in dark mode also requires deliberate calibration. White text on dark surfaces visually expands and appears bolder due to halation effects. Softening headline text to high-contrast off-whites (such as zinc-100) and reducing font weights slightly preserves clean typographical hierarchy." },
        { type: "bullet", text: "Respecting system color preferences via prefers-color-scheme while providing a seamless toggle stored in local storage and cookies allows readers to enjoy a tailored visual experience that effortlessly aligns with their environment." },
        { type: "paragraph", text: "Careful attention must also be given to syntax highlighting and code block styling in dark mode. Using subdued pastel palettes for token keywords and variables avoids blinding glare while maintaining clear code legibility, creating a visually soothing reading environment for developers and technical readers alike." }
      ],
    },

    // --- Julian Morales (5 posts) ---
    {
      authorIdx: 4,
      postNum: 21,
      title: "PostgreSQL Indexing Deep Dive: B-Tree, GiST, GIN, and BRIN Explained",
      coverImage: "https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 14,
      readingTime: 5,
      tagNames: ["database", "backend", "performance"],
      blocks: [
        { type: "paragraph", text: "Indexes are the single most influential database tuning lever available to backend engineers. Yet, many teams default to standard B-Tree indexes on every queried column without understanding how PostgreSQL index structures actually function under sustained production workloads." },
        { type: "heading", text: "Selecting the Right Index Type for Specialized Access Patterns", level: 2 },
        { type: "paragraph", text: "While standard B-Tree indexes excel at scalar equality and range comparisons (=, <, >, BETWEEN), they are poorly suited for multi-valued data types like JSONB, full-text search vectors, or array columns. For these patterns, Generalized Inverted Indexes (GIN) provide blazing fast lookup by mapping individual elements and keys directly to row pointers." },
        { type: "quote", text: "Every index carries write amplification costs; choose your index types with precision rather than defaulting blindly to B-Trees." },
        { type: "heading", text: "PostgreSQL Index Typology", level: 3 },
        { type: "bullet", text: "For massive, append-only time-series tables containing hundreds of millions of rows, Block Range Indexes (BRIN) provide an astonishing engineering advantage. Rather than indexing every single row, BRIN stores the minimum and maximum values for blocks of physical pages, achieving 99% reduction in index storage space while accelerating timestamp queries." },
        { type: "bullet", text: "Regularly analyzing pg_stat_user_indexes and using EXPLAIN (ANALYZE, BUFFERS) is mandatory to discover unused indexes that needlessly slow down write throughput. Every index carries write amplification costs; choose your index types with precision." },
        { type: "paragraph", text: "Finally, understanding multi-column compound index ordering is vital. Placing high-cardinality equality columns first before range filter columns enables the query planner to utilize index skips effectively, transforming full table scans into single-digit millisecond index scans across multi-million row datasets." }
      ],
    },
    {
      authorIdx: 4,
      postNum: 22,
      title: "Why We Chose Partitioning Over Sharding for Billions of Event Logs",
      coverImage: "https://images.pexels.com/photos/3182834/pexels-photo-3182834.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 38,
      readingTime: 5,
      tagNames: ["database", "architecture", "backend"],
      blocks: [
        { type: "paragraph", text: "When relational database tables grow into hundreds of millions of rows, query performance degrades and routine maintenance operations like VACUUM and index rebuilding become perilous, high-latency nightmares. At this inflection point, engineering teams often panic and leap prematurely into distributed database sharding." },
        { type: "heading", text: "Declarative Partitioning vs Premature Sharding", level: 2 },
        { type: "paragraph", text: "Sharding introduces tremendous operational complexity: distributed transactions, cross-shard joins, custom routing logic, and rebalancing scripts. Before taking on that heavy burden, declarative table partitioning in PostgreSQL offers an elegant, native solution that keeps your infrastructure unified." },
        { type: "quote", text: "Partition management transforms data retention: purging aged-out historical logs becomes an instantaneous, zero-cost DROP TABLE operation." },
        { type: "heading", text: "Partitioning Decision Framework", level: 3 },
        { type: "bullet", text: "By partitioning our high-volume event logs by time range (monthly partitions), PostgreSQL query planner automatically performs partition pruning, scanning only the physical tables relevant to the query's WHERE clause. Queries filtering for recent events execute in milliseconds without touching gigabytes of historical data." },
        { type: "bullet", text: "Furthermore, partition management transforms data retention policies. Rather than running expensive, row-by-row DELETE queries that cause severe MVCC table bloat, purging aged-out historical logs becomes an instantaneous, zero-cost DROP TABLE operation on the detached partition." },
        { type: "paragraph", text: "Automating partition creation and retention through scheduled background workers or tools like pg_partman ensures that upcoming partitions exist well before new data arrives. Maintaining a continuous rolling window of historical partitions eliminates manual DBA interventions and ensures predictable database scalability. This partitioned architecture scales effortlessly to hundreds of millions of events, maintaining sub-millisecond query execution speeds while keeping operational costs and maintenance overhead completely minimal." }
      ],
    },
    {
      authorIdx: 4,
      postNum: 23,
      title: "Diagnosing and Eliminating Hidden N+1 Query Patterns in Prisma ORM",
      coverImage: "https://images.pexels.com/photos/3862632/pexels-photo-3862632.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 64,
      readingTime: 4,
      tagNames: ["database", "backend", "typescript"],
      blocks: [
        { type: "paragraph", text: "Object-Relational Mapping (ORM) tools like Prisma have elevated developer productivity and type safety to unprecedented heights. However, abstracting away SQL behind fluent JavaScript methods makes it dangerously easy to accidentally introduce devastating N+1 query patterns that cripple API performance under production load." },
        { type: "heading", text: "Eliminating Serial Database Roundtrips in ORMs", level: 2 },
        { type: "paragraph", text: "An N+1 query occurs when an initial query fetches N records, followed by N separate subsequent queries executed inside a loop to retrieve related relations (such as authors, tags, or comment counts). What appears as two clean lines of code in a controller translates into dozens of sequential database round-trips over the network." },
        { type: "quote", text: "What appears as two clean lines of code in a controller can translate into dozens of sequential roundtrips over the network under production load." },
        { type: "heading", text: "Query Optimization Strategies", level: 3 },
        { type: "bullet", text: "Prisma provides powerful relation inclusion (`include` or `select`) that generates optimized SQL joins or single batch `IN (...)` queries. Additionally, leveraging DataLoader patterns or explicit aggregate queries (`_count`) allows services to batch disparate requests into single, highly efficient database calls." },
        { type: "bullet", text: "Enabling query logging in development or instrumenting Prisma with OpenTelemetry trace middleware immediately exposes redundant queries. Catching N+1 queries during local testing prevents embarrassing database connection pool exhaustion incidents in production." },
        { type: "paragraph", text: "In production environments, setting up automated query count assertions in integration tests acts as a permanent regression guardrail. If a developer accidentally introduces a loop that triggers redundant database queries, the test suite fails immediately before the change ever reaches staging or production pipelines." }
      ],
    },
    {
      authorIdx: 4,
      postNum: 24,
      title: "Concurrency Control: Optimistic vs Pessimistic Locking in Production",
      coverImage: "https://images.pexels.com/photos/574077/pexels-photo-574077.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 92,
      readingTime: 5,
      tagNames: ["database", "backend", "architecture"],
      blocks: [
        { type: "paragraph", text: "Managing concurrent data modifications is a fundamental challenge in multi-user web applications. When two users simultaneously attempt to update the same inventory record, book the same reservation seat, or modify a shared document, race conditions will inevitably corrupt business data unless proper concurrency controls are enforced." },
        { type: "heading", text: "Non-Blocking Optimistic Locking for High-Throughput APIs", level: 2 },
        { type: "paragraph", text: "Pessimistic locking utilizes database row-level locks (`SELECT ... FOR UPDATE`) to prevent other transactions from reading or modifying the locked row until the holding transaction commits. While foolproof, pessimistic locks risk contention bottlenecks and dangerous deadlocks when transactions span multiple external service calls." },
        { type: "quote", text: "Reserve pessimistic locking strictly for high-contention financial balances; modern web architectures thrive on non-blocking optimistic versioning." },
        { type: "heading", text: "Concurrency Control Rules", level: 3 },
        { type: "bullet", text: "Optimistic concurrency control assumes conflicts are relatively rare. By adding a version integer or updated timestamp column, updates verify that the record has not changed since it was read (`UPDATE table SET val = $1, version = version + 1 WHERE id = $2 AND version = $3`). If another transaction updated the row first, the update affects zero rows, signaling the application to retry cleanly." },
        { type: "bullet", text: "For modern web architectures, optimistic locking is almost universally preferred for high-read, low-write domains due to its non-blocking nature and zero lock-holding overhead. Reserve pessimistic locking strictly for high-contention, low-latency financial balances where immediate serialization is essential." },
        { type: "paragraph", text: "Implementing exponential backoff with randomized jitter on optimistic lock retries prevents concurrent worker threads from entering destructive retry storms. When multiple clients compete to claim or update a contested record, jittered retries ensure smooth throughput without overloading database connection limits." }
      ],
    },
    {
      authorIdx: 4,
      postNum: 25,
      title: "Cache Invalidation at Scale: Designing Robust Two-Tier Redis Strategies",
      coverImage: "https://images.pexels.com/photos/1181373/pexels-photo-1181373.jpeg?auto=compress&cs=tinysrgb&w=1200",
      hoursAgo: 125,
      readingTime: 5,
      tagNames: ["database", "performance", "backend"],
      blocks: [
        { type: "paragraph", text: "Phil Karlton famously observed that cache invalidation is one of the two hardest problems in computer science. Without disciplined invalidation boundaries, cached data quickly drifts from the underlying database source of truth, serving stale information or corrupted session states to end users." },
        { type: "heading", text: "Two-Tier Caching Architecture and Stampede Prevention", level: 2 },
        { type: "paragraph", text: "A two-tier caching strategy combines ultra-fast local in-memory caches (such as Node.js lru-cache) with a centralized Redis cluster. Local memory provides sub-microsecond access for hot static data, while Redis coordinates cross-instance cache synchronization and handles dynamic query caching." },
        { type: "quote", text: "Rigorous cache design and probabilistic early expiration turn high-traffic API spikes into predictable, boring operational events." },
        { type: "heading", text: "Caching Resilience Checklist", level: 3 },
        { type: "bullet", text: "To prevent cache stampedes (where hundreds of concurrent requests simultaneously hit the primary database when a popular cache key expires), we implement probabilistic early expiration and distributed mutex locking (Redlock). Background workers refresh keys prior to expiration without blocking customer requests." },
        { type: "bullet", text: "Finally, pairing tag-based cache invalidation with database commit hooks ensures that cache purges occur only after database transactions successfully commit. Rigorous cache design turns high-traffic API spikes into predictable, boring operational events." },
        { type: "paragraph", text: "Furthermore, implementing automated circuit breakers around Redis access protects backend services if the caching layer experiences transient network partitions or failover events. Systems should gracefully fall back to database queries with strict rate limits rather than crashing entire user-facing API routes. By enforcing strict telemetry metrics around cache hit ratios and eviction frequencies, engineering teams can continuously tune memory limits and TTL windows to achieve optimal throughput under heavy customer traffic." }
      ],
    },
  ];

  const seededPosts = [];

  for (let i = 0; i < postsData.length; i++) {
    const p = postsData[i]!;
    const author = createdUsers[p.authorIdx]!;
    const publishedAt = new Date(now - p.hoursAgo * hourMs);
    const postId = `22222222-0000-0000-0000-${String(p.postNum).padStart(12, "0")}`;

    // Calculate score
    const recencyScore = 1 / (1 + p.hoursAgo / 24);
    const initialScore = Number((recencyScore + ((i % 5) + 1) * 0.15).toFixed(4));

    const post = await prisma.post.upsert({
      where: { id: postId },
      update: {
        title: p.title,
        content: makeEditorialContent(p.blocks),
        coverImage: p.coverImage,
        status: "PUBLISHED",
        score: initialScore,
        readingTime: p.readingTime,
        publishedAt,
      },
      create: {
        id: postId,
        authorId: author.id,
        title: p.title,
        content: makeEditorialContent(p.blocks),
        coverImage: p.coverImage,
        status: "PUBLISHED",
        score: initialScore,
        readingTime: p.readingTime,
        viewCount: 45 + (i * 18),
        publishedAt,
      },
    });

    seededPosts.push(post);

    // Link Post Tags
    for (const tagName of p.tagNames) {
      const tag = tagMap[tagName];
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

  console.log(`✓ ${seededPosts.length} Posts created (each >200 words) with Pexels cover images and tags`);

  // 6. Add Interactions: Likes, Bookmarks, and Comments across posts
  const commentTemplates = [
    "Incredible depth and clarity in this article! The real-world production context makes this so valuable.",
    "Bookmarked! We ran into this exact challenge last week and your suggested approach solves it cleanly.",
    "Super thoughtful breakdown. How do you approach automated testing and regression suites for this?",
    "Spot on analysis. Especially appreciated the section on operational trade-offs and edge failure modes.",
    "One of the clearest explanations of this topic I have read this year. Shared with our entire engineering team!",
  ];

  for (let i = 0; i < seededPosts.length; i++) {
    const post = seededPosts[i]!;

    // 2-3 likes per post
    const numLikes = (i % 3) + 2;
    for (let l = 0; l < numLikes; l++) {
      const liker = createdUsers[(i + l + 1) % createdUsers.length]!;
      await prisma.like.upsert({
        where: {
          userId_postId: {
            userId: liker.id,
            postId: post.id,
          },
        },
        update: {},
        create: {
          userId: liker.id,
          postId: post.id,
        },
      });
    }

    // Bookmark every other post
    if (i % 2 === 0) {
      const bookmarker = createdUsers[(i + 2) % createdUsers.length]!;
      await prisma.bookmark.upsert({
        where: {
          userId_postId: {
            userId: bookmarker.id,
            postId: post.id,
          },
        },
        update: {},
        create: {
          userId: bookmarker.id,
          postId: post.id,
        },
      });
    }

    // Comments on posts
    if (i % 2 === 0 || i % 3 === 0) {
      const commenter = createdUsers[(i + 3) % createdUsers.length]!;
      const commentBody = commentTemplates[i % commentTemplates.length]!;
      const commentId = `33333333-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;

      const comment = await prisma.comment.upsert({
        where: { id: commentId },
        update: { body: commentBody },
        create: {
          id: commentId,
          postId: post.id,
          authorId: commenter.id,
          body: commentBody,
        },
      });

      // Add a reply to some comments
      if (i % 4 === 0) {
        const replier = createdUsers[(i + 4) % createdUsers.length]!;
        const replyId = `44444444-0000-0000-0000-${String(i + 1).padStart(12, "0")}`;
        await prisma.comment.upsert({
          where: { id: replyId },
          update: { body: "Thanks for the feedback! Delighted you found the real-world operational examples helpful." },
          create: {
            id: replyId,
            postId: post.id,
            parentId: comment.id,
            authorId: replier.id,
            body: "Thanks for the feedback! Delighted you found the real-world operational examples helpful.",
          },
        });
      }
    }
  }

  console.log("✓ Likes, bookmarks, and comments populated across posts");
  console.log("🎉 Seeding script completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
