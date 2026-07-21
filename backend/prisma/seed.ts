// ============================================================
// prisma/seed.ts — dev seed for verifying board/list/card CRUD + workspace guard.
//   Run: npx prisma db seed   (or   npx tsx prisma/seed.ts)
//   Idempotent-ish: upserts by stable email / unique workspace name.
// ============================================================
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LIST_BLOCK = 65536;

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "dev-owner@example.com" },
    update: {},
    create: {
      name: "남영훈",
      email: "dev-owner@example.com",
      password_hash: "$2b$10$devdummyhashreplacebeforeprodxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "dev-viewer@example.com" },
    update: {},
    create: {
      name: "조회자",
      email: "dev-viewer@example.com",
      password_hash: "$2b$10$devdummyhashreplacebeforeprodxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    },
  });

  const workspace = await prisma.workspace.findFirst({
    where: { name: "Korello 데모 워크스페이스" },
  });
  const wsRecord =
    workspace ??
    (await prisma.workspace.create({
      data: { name: "Korello 데모 워크스페이스", is_public: true },
    }));

  await prisma.workspaceMember.upsert({
    where: { user_id_workspace_id: { user_id: owner.id, workspace_id: wsRecord.id } },
    update: { role: "OWNER" },
    create: { user_id: owner.id, workspace_id: wsRecord.id, role: "OWNER" },
  });

  await prisma.workspaceMember.upsert({
    where: { user_id_workspace_id: { user_id: viewer.id, workspace_id: wsRecord.id } },
    update: { role: "VIEWER" },
    create: { user_id: viewer.id, workspace_id: wsRecord.id, role: "VIEWER" },
  });

  const defaultListNames = ["할 일", "진행 중", "완료"];
  for (let i = 0; i < defaultListNames.length; i++) {
    const base = { workspace_id: wsRecord.id, name: defaultListNames[i] };
    const existing = await prisma.list.findFirst({ where: base });
    if (existing) continue;
    await prisma.list.create({
      data: { ...base, sequence: (i + 1) * LIST_BLOCK },
    });
  }

  console.log("Seed complete.");
  console.log("  workspaceId:", wsRecord.id);
  console.log("  ownerId:    ", owner.id, "(role OWNER)");
  console.log("  viewerId:   ", viewer.id, "(role VIEWER)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
