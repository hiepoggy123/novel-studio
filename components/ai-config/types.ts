export type ConfigItemId =
  | "global-instruction"
  | "chat-panel"
  | "analysis-chapter"
  | "analysis-aggregation"
  | "analysis-character"
  | "continuity"
  | "chapter-translate"
  | "chapter-review"
  | "chapter-rewrite"
  | "character-enhance"
  | "character-generate"
  | "autowrite-setup"
  | "autowrite-world"
  | "autowrite-characters"
  | "autowrite-arcs"
  | "autowrite-plans"
  | "autowrite-plan"
  | "autowrite-outline"
  | "autowrite-writer"
  | "autowrite-normalize"
  | "autowrite-observe"
  | "autowrite-audit"
  | "autowrite-revise"
  | "autowrite-polish"
  | "autowrite-context"
  | "autowrite-direction"
  | "autowrite-review"
  | "autowrite-rewrite";

export interface TreeLeaf {
  type: "leaf";
  id: ConfigItemId;
  label: string;
}

export interface TreeFolder {
  type: "folder";
  id: string;
  label: string;
  children: (TreeLeaf | TreeFolder)[];
}

export type TreeNode = TreeLeaf | TreeFolder;

export const TREE_STRUCTURE: TreeNode[] = [
  { type: "leaf", id: "global-instruction", label: "Chỉ thị chung" },
  { type: "leaf", id: "chat-panel", label: "Chat panel" },
  {
    type: "folder",
    id: "analysis",
    label: "Công cụ phân tích",
    children: [
      { type: "leaf", id: "analysis-chapter", label: "Phân tích chương" },
      { type: "leaf", id: "analysis-aggregation", label: "Tổng hợp tiểu thuyết" },
      { type: "leaf", id: "analysis-character", label: "Hồ sơ nhân vật" },
    ],
  },
  { type: "leaf", id: "continuity", label: "Kiểm tra nhất quán" },
  {
    type: "folder",
    id: "chapter-tools",
    label: "Công cụ chương",
    children: [
      { type: "leaf", id: "chapter-translate", label: "Dịch thuật" },
      { type: "leaf", id: "chapter-review", label: "Đánh giá" },
      { type: "leaf", id: "chapter-rewrite", label: "Viết lại" },
    ],
  },
  {
    type: "folder",
    id: "character-tools",
    label: "Công cụ nhân vật",
    children: [
      { type: "leaf", id: "character-enhance", label: "Cải thiện hồ sơ" },
      { type: "leaf", id: "character-generate", label: "Tạo nhân vật" },
    ],
  },
  {
    type: "folder",
    id: "autowrite",
    label: "Tự động viết",
    children: [
      {
        type: "folder",
        id: "autowrite-setup-folder",
        label: "Cài đặt",
        children: [
          { type: "leaf", id: "autowrite-setup", label: "Pipeline" },
          { type: "leaf", id: "autowrite-world", label: "Thế giới quan" },
          { type: "leaf", id: "autowrite-characters", label: "Nhân vật" },
          { type: "leaf", id: "autowrite-arcs", label: "Mạch truyện" },
          { type: "leaf", id: "autowrite-plans", label: "Kế hoạch chương" },
        ],
      },
      {
        type: "folder",
        id: "autowrite-pipeline-folder",
        label: "Pipeline",
        children: [
          { type: "leaf", id: "autowrite-plan", label: "Kế hoạch" },
          { type: "leaf", id: "autowrite-outline", label: "Giàn ý" },
          { type: "leaf", id: "autowrite-writer", label: "Viết truyện" },
          { type: "leaf", id: "autowrite-normalize", label: "Chuẩn hóa" },
          { type: "leaf", id: "autowrite-observe", label: "Quan sát" },
          { type: "leaf", id: "autowrite-audit", label: "Đánh giá" },
          { type: "leaf", id: "autowrite-revise", label: "Viết lại" },
          { type: "leaf", id: "autowrite-polish", label: "Tinh chỉnh" },
        ],
      },
    ],
  },
];
