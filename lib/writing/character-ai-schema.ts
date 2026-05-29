import { jsonSchema } from "ai";

export interface CharacterAIFields {
  name: string;
  role?: string;
  description?: string;
  age?: string;
  sex?: string;
  appearance?: string;
  personality?: string;
  hobbies?: string;
  relationshipWithMC?: string;
  characterArc?: string;
  strengths?: string;
  weaknesses?: string;
  motivations?: string;
  goals?: string;
}

const fieldProps = {
  name: { type: "string", description: "Tên nhân vật" },
  role: {
    type: "string",
    description: "Vai trò (nhân vật chính, phản diện, phụ, đồng hành...)",
  },
  description: { type: "string", description: "Mô tả tổng quan ngắn gọn" },
  age: { type: "string", description: "Tuổi hoặc độ tuổi" },
  sex: { type: "string", description: "Giới tính" },
  appearance: { type: "string", description: "Ngoại hình" },
  personality: { type: "string", description: "Tính cách" },
  hobbies: { type: "string", description: "Sở thích" },
  relationshipWithMC: {
    type: "string",
    description: "Mối quan hệ với nhân vật chính",
  },
  characterArc: { type: "string", description: "Hành trình phát triển" },
  strengths: { type: "string", description: "Điểm mạnh" },
  weaknesses: { type: "string", description: "Điểm yếu" },
  motivations: { type: "string", description: "Động lực" },
  goals: { type: "string", description: "Mục tiêu" },
} as const;

export const characterAIObjectSchema = jsonSchema<CharacterAIFields>({
  type: "object",
  properties: fieldProps,
  required: ["name"],
  additionalProperties: false,
});

export interface CharacterListResult {
  characters: CharacterAIFields[];
}

export const characterListSchema = jsonSchema<CharacterListResult>({
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: fieldProps,
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  required: ["characters"],
});
