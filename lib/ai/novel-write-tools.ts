import { db, type CharacterRelationship, type NameDescription } from "@/lib/db";
import { applyStatePatch } from "@/lib/writing/state/state-store";
import { tool } from "ai";
import { z } from "zod";

// ─── Shared helpers ──────────────────────────────────────────

export function normalizeName(value: string) {
  return value.normalize("NFC").trim().toLowerCase();
}

export function updateNamedListItem(
  items: NameDescription[] | undefined,
  name: string,
  description: string,
) {
  const normalized = normalizeName(name);
  const current = items ?? [];
  const index = current.findIndex(
    (item) => normalizeName(item.name) === normalized,
  );
  if (index === -1) return { updated: false, items: current };

  const next = [...current];
  next[index] = { ...next[index], description };
  return { updated: true, items: next };
}

export async function findCharacterByName(novelId: string, name: string) {
  const normalized = normalizeName(name);
  const characters = await db.characters
    .where("novelId")
    .equals(novelId)
    .toArray();
  return (
    characters.find((char) => normalizeName(char.name) === normalized) ?? null
  );
}

// ─── Write tools factory ─────────────────────────────────────

/**
 * Mutation tools scoped to a specific novel.
 * Each tool immediately writes to DB. Use in chat / autonomous workflows.
 * For batch-accumulation (incremental analysis), use the schema-only tools in
 * lib/analysis/incremental-tools.ts instead.
 */
export function createNovelWriteTools(novelId: string) {
  return {
    updateNovelSynopsis: tool({
      description: "Cập nhật tóm tắt tiểu thuyết.",
      inputSchema: z.object({
        synopsis: z.string().describe("Tóm tắt đã cập nhật"),
      }),
      execute: async ({ synopsis }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        await db.novels.update(novelId, { synopsis, updatedAt: new Date() });
        return { ok: true, synopsis };
      },
    }),

    updateGenresTags: tool({
      description: "Cập nhật thể loại và nhãn của tiểu thuyết.",
      inputSchema: z.object({
        genres: z.array(z.string()).describe("Danh sách thể loại đã cập nhật"),
        tags: z.array(z.string()).describe("Danh sách nhãn đã cập nhật"),
      }),
      execute: async ({ genres, tags }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        await db.novels.update(novelId, { genres, tags, updatedAt: new Date() });
        return { ok: true, genresCount: genres.length, tagsCount: tags.length };
      },
    }),

    updateWorldBuilding: tool({
      description:
        "Cập nhật các trường xây dựng thế giới, chỉ gửi các trường cần đổi.",
      inputSchema: z.object({
        worldOverview: z.string().optional(),
        powerSystem: z.string().nullable().optional(),
        storySetting: z.string().optional(),
        timePeriod: z.string().nullable().optional(),
        worldRules: z.string().nullable().optional(),
        technologyLevel: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        const hasChanges = Object.keys(input).length > 0;
        if (!hasChanges)
          return { ok: false, message: "Không có trường nào để cập nhật" };

        const payload: Partial<{
          worldOverview: string;
          powerSystem: string;
          storySetting: string;
          timePeriod: string;
          worldRules: string;
          technologyLevel: string;
        }> = {};
        if (input.worldOverview !== undefined)
          payload.worldOverview = input.worldOverview;
        if (input.powerSystem !== undefined)
          payload.powerSystem = input.powerSystem ?? "";
        if (input.storySetting !== undefined)
          payload.storySetting = input.storySetting;
        if (input.timePeriod !== undefined)
          payload.timePeriod = input.timePeriod ?? "";
        if (input.worldRules !== undefined)
          payload.worldRules = input.worldRules ?? "";
        if (input.technologyLevel !== undefined)
          payload.technologyLevel = input.technologyLevel ?? "";

        await db.novels.update(novelId, { ...payload, updatedAt: new Date() });
        return { ok: true, updatedFields: Object.keys(payload) };
      },
    }),

    addFaction: tool({
      description: "Thêm một phe phái/tổ chức mới vào tiểu thuyết.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string(),
      }),
      execute: async ({ name, description }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        const factions = novel.factions ?? [];
        const exists = factions.some(
          (item) => normalizeName(item.name) === normalizeName(name),
        );
        if (exists) return { ok: false, message: "Phe phái đã tồn tại" };

        const next = [...factions, { name, description }];
        await db.novels.update(novelId, { factions: next, updatedAt: new Date() });
        return { ok: true, faction: { name, description } };
      },
    }),

    updateFaction: tool({
      description: "Cập nhật mô tả của phe phái hiện có theo tên.",
      inputSchema: z.object({
        name: z.string().describe("Tên chính xác hoặc gần đúng của phe phái"),
        description: z.string().describe("Mô tả đã cập nhật"),
      }),
      execute: async ({ name, description }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        const { updated, items } = updateNamedListItem(
          novel.factions,
          name,
          description,
        );
        if (!updated)
          return { ok: false, message: "Không tìm thấy phe phái để cập nhật" };

        await db.novels.update(novelId, { factions: items, updatedAt: new Date() });
        return { ok: true, name, description };
      },
    }),

    addLocation: tool({
      description: "Thêm một địa điểm quan trọng mới.",
      inputSchema: z.object({
        name: z.string(),
        description: z.string(),
      }),
      execute: async ({ name, description }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        const keyLocations = novel.keyLocations ?? [];
        const exists = keyLocations.some(
          (item) => normalizeName(item.name) === normalizeName(name),
        );
        if (exists) return { ok: false, message: "Địa điểm đã tồn tại" };

        const next = [...keyLocations, { name, description }];
        await db.novels.update(novelId, {
          keyLocations: next,
          updatedAt: new Date(),
        });
        return { ok: true, location: { name, description } };
      },
    }),

    updateLocation: tool({
      description: "Cập nhật mô tả của địa điểm hiện có theo tên.",
      inputSchema: z.object({
        name: z.string().describe("Tên chính xác hoặc gần đúng của địa điểm"),
        description: z.string().describe("Mô tả đã cập nhật"),
      }),
      execute: async ({ name, description }) => {
        const novel = await db.novels.get(novelId);
        if (!novel) return { error: "Không tìm thấy tiểu thuyết" };

        const { updated, items } = updateNamedListItem(
          novel.keyLocations,
          name,
          description,
        );
        if (!updated)
          return { ok: false, message: "Không tìm thấy địa điểm để cập nhật" };

        await db.novels.update(novelId, {
          keyLocations: items,
          updatedAt: new Date(),
        });
        return { ok: true, name, description };
      },
    }),

    addCharacter: tool({
      description: "Thêm nhân vật mới vào hồ sơ nhân vật của tiểu thuyết.",
      inputSchema: z.object({
        name: z.string(),
        role: z.string(),
        description: z.string(),
        age: z.string().optional(),
        sex: z.string().optional(),
        appearance: z.string().optional(),
        personality: z.string().optional(),
        hobbies: z.string().optional(),
        relationshipWithMC: z.string().optional(),
        relationships: z
          .array(z.object({ characterName: z.string(), description: z.string() }))
          .optional(),
        strengths: z.string().optional(),
        weaknesses: z.string().optional(),
        motivations: z.string().optional(),
        goals: z.string().optional(),
        currentState: z.string().optional(),
      }),
      execute: async (input) => {
        const existing = await findCharacterByName(novelId, input.name);
        if (existing) return { ok: false, message: "Nhân vật đã tồn tại" };

        const now = new Date();
        const id = crypto.randomUUID();
        await db.characters.add({
          id,
          novelId,
          name: input.name,
          role: input.role,
          description: input.description,
          age: input.age,
          sex: input.sex,
          appearance: input.appearance,
          personality: input.personality,
          hobbies: input.hobbies,
          relationshipWithMC: input.relationshipWithMC,
          relationships: input.relationships,
          strengths: input.strengths,
          weaknesses: input.weaknesses,
          motivations: input.motivations,
          goals: input.goals,
          createdAt: now,
          updatedAt: now,
        });

        if (input.currentState) {
          await applyStatePatch(novelId, [{ name: input.name, currentState: input.currentState }]);
        }

        return { ok: true, characterId: id, name: input.name };
      },
    }),

    updateCharacter: tool({
      description:
        "Cập nhật nhân vật hiện có theo tên. Chỉ gửi các trường cần đổi.",
      inputSchema: z.object({
        name: z.string().describe("Tên nhân vật cần cập nhật"),
        role: z.string().optional(),
        description: z.string().optional(),
        age: z.string().optional(),
        sex: z.string().optional(),
        appearance: z.string().optional(),
        personality: z.string().optional(),
        hobbies: z.string().optional(),
        relationshipWithMC: z.string().optional(),
        strengths: z.string().optional(),
        weaknesses: z.string().optional(),
        motivations: z.string().optional(),
        goals: z.string().optional(),
        currentState: z.string().optional(),
        location: z.string().optional(),
        status: z.string().optional(),
      }),
      execute: async ({ name, currentState, location, status, ...profileUpdates }) => {
        const character = await findCharacterByName(novelId, name);
        if (!character) return { error: "Không tìm thấy nhân vật" };

        const hasProfileChanges = Object.keys(profileUpdates).length > 0;
        const hasStateChanges = currentState !== undefined || location !== undefined || status !== undefined;

        if (!hasProfileChanges && !hasStateChanges)
          return { ok: false, message: "Không có trường nào để cập nhật" };

        if (hasProfileChanges) {
          await db.characters.update(character.id, {
            ...profileUpdates,
            updatedAt: new Date(),
          });
        }

        if (hasStateChanges) {
          await applyStatePatch(novelId, [
            { name, ...(currentState !== undefined ? { currentState } : {}), ...(location !== undefined ? { location } : {}), ...(status !== undefined ? { status } : {}) },
          ]);
        }

        return {
          ok: true,
          characterId: character.id,
          updatedFields: [...Object.keys(profileUpdates), ...(hasStateChanges ? ["state"] : [])],
        };
      },
    }),

    addRelationship: tool({
      description: "Thêm mối quan hệ cho một nhân vật hiện có.",
      inputSchema: z.object({
        characterName: z.string().describe("Tên nhân vật cần thêm quan hệ"),
        relatedTo: z.string().describe("Tên nhân vật liên quan"),
        description: z.string().describe("Mô tả mối quan hệ"),
      }),
      execute: async ({ characterName, relatedTo, description }) => {
        const character = await findCharacterByName(novelId, characterName);
        if (!character) return { error: "Không tìm thấy nhân vật" };

        const relationships: CharacterRelationship[] =
          character.relationships ?? [];
        const exists = relationships.some(
          (item) =>
            normalizeName(item.characterName) === normalizeName(relatedTo) &&
            normalizeName(item.description) === normalizeName(description),
        );
        if (exists) return { ok: false, message: "Mối quan hệ đã tồn tại" };

        const next = [...relationships, { characterName: relatedTo, description }];
        await db.characters.update(character.id, {
          relationships: next,
          updatedAt: new Date(),
        });

        return { ok: true, characterId: character.id, relatedTo };
      },
    }),
  };
}
