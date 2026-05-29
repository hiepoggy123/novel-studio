import { jsonSchema } from "ai";
import type { StateDelta } from "@/lib/writing/state/schemas";

export const observerOutputSchema = jsonSchema<StateDelta>({
  type: "object",
  properties: {
    chapter: {
      type: "number",
      description: "Số thứ tự chương vừa viết (số nguyên dương)",
    },
    factOps: {
      type: "array",
      description: "Các thao tác cập nhật sự kiện/thực tế trong thế giới truyện",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["add", "remove"],
            description: "'add' để thêm/cập nhật sự thật, 'remove' để xoá",
          },
          subject: {
            type: "string",
            description: "Chủ thể (tên nhân vật, địa điểm, thế lực...)",
          },
          predicate: {
            type: "string",
            description: "Quan hệ hoặc thuộc tính (ví dụ: 'sở hữu', 'biết bí mật', 'ở tại')",
          },
          object: {
            type: "string",
            description: "Giá trị hoặc đối tượng của quan hệ",
          },
        },
        required: ["op", "subject", "predicate", "object"],
        additionalProperties: false,
      },
    },
    hookOps: {
      type: "array",
      description: "Cập nhật tiến trình các mốc cốt truyện (PlotPoint)",
      items: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: ["advance", "resolve", "defer", "add"],
            description:
              "'advance'=tiến thêm, 'resolve'=hoàn thành/giải quyết, 'defer'=trì hoãn, 'add'=thêm mốc mới",
          },
          plotArcId: {
            type: "string",
            description: "ID của PlotArc chứa mốc này",
          },
          plotPointId: {
            type: "string",
            description: "ID của PlotPoint (bỏ qua nếu op='add')",
          },
          title: {
            type: "string",
            description: "Tiêu đề mốc (bắt buộc khi op='add')",
          },
          description: {
            type: "string",
            description: "Mô tả mốc (khi op='add')",
          },
          chapterOrder: {
            type: "number",
            description: "Số chương liên quan đến thao tác này",
          },
        },
        required: ["op", "plotArcId"],
        additionalProperties: false,
      },
    },
    characterStatePatches: {
      type: "array",
      description: "Cập nhật trạng thái nhân vật sau chương này",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Tên nhân vật",
          },
          currentState: {
            type: "string",
            description: "Trạng thái/tâm lý/tình huống hiện tại",
          },
          location: {
            type: "string",
            description: "Vị trí hiện tại của nhân vật",
          },
          status: {
            type: "string",
            description: "Trạng thái đặc biệt (bị thương, mất tích, chết...)",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    chapterSummary: {
      type: "string",
      description: "Tóm tắt ngắn gọn nội dung chương (2–4 câu, tiếng Việt)",
    },
    knownTruthsAdded: {
      type: "array",
      description:
        "Các sự thật bất biến mới được tiết lộ trong chương (thông tin không thể thay đổi về thế giới truyện)",
      items: { type: "string" },
    },
  },
  required: [
    "chapter",
    "factOps",
    "hookOps",
    "characterStatePatches",
    "chapterSummary",
    "knownTruthsAdded",
  ],
  additionalProperties: false,
});
