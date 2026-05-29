import { describe, it, expect } from "vitest";
import { computeStyleMetrics, formatFingerprint } from "../fingerprint";

const FIRST_PERSON_PROSE = `Tôi bước vào căn phòng tối tăm. Ánh đèn leo lét chiếu lên khuôn mặt ta. Mình không biết phải nói gì.

Tôi dừng lại. Tim đập. Tôi nhìn quanh.

"Anh ở đây à?" Tôi hỏi khẽ.`;

const THIRD_PERSON_PROSE = `Hắn bước vào căn phòng. Ánh mắt y lướt nhanh qua từng góc khuất. Chàng dừng lại giữa phòng và quan sát.

Nàng đứng bên cửa sổ. Cô không quay lại. Anh không lên tiếng.

"Sao anh đến?" Nàng hỏi, giọng lạnh.`;

const DIALOGUE_HEAVY_PROSE = `"Em không muốn đi." Cô nói, giọng run rẩy.

"Nhưng em phải đi." Anh đáp, kiên quyết.

"Tại sao?" Cô quay lại nhìn anh. "Tại sao em phải làm vậy?"

"Vì đây là lựa chọn duy nhất." Anh thở dài. "Em hiểu không?"`;

const LONG_SENTENCE_PROSE = `Trong màn đêm tĩnh mịch bao phủ khắp khu rừng già cổ thụ nơi mà hàng trăm năm qua chưa từng có bóng người lui tới, tiếng động kỳ lạ bỗng vang lên xé toang sự yên tĩnh ngàn đời của đại địa.

Ánh sáng xanh lét phát ra từ đỉnh ngọn núi cao nhất trong dãy núi chạy dài theo hướng đông bắc, lan tỏa ra xa hàng chục dặm, soi rõ từng khe đá từng ngọn cỏ dưới ánh sáng kỳ bí đó.`;

const EMPTY_PROSE = ``;

describe("computeStyleMetrics", () => {
  it("returns zero metrics for empty scenes", () => {
    const result = computeStyleMetrics([{ content: EMPTY_PROSE }]);
    expect(result.avgSentenceLengthChars).toBe(0);
    expect(result.paragraphLengthVariance).toBe(0);
    expect(result.dialogueDensity).toBe(0);
    expect(result.firstPersonFreq).toBe(0);
    expect(result.thirdPersonFreq).toBe(0);
  });

  it("detects first-person dominance", () => {
    const result = computeStyleMetrics([{ content: FIRST_PERSON_PROSE }]);
    expect(result.firstPersonFreq).toBeGreaterThan(result.thirdPersonFreq);
    expect(result.firstPersonFreq).toBeGreaterThan(0);
  });

  it("detects third-person dominance", () => {
    const result = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    expect(result.thirdPersonFreq).toBeGreaterThan(result.firstPersonFreq);
    expect(result.thirdPersonFreq).toBeGreaterThan(0);
  });

  it("measures dialogue density from quote markers", () => {
    const heavyResult = computeStyleMetrics([{ content: DIALOGUE_HEAVY_PROSE }]);
    const lightResult = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    expect(heavyResult.dialogueDensity).toBeGreaterThan(lightResult.dialogueDensity);
    expect(heavyResult.dialogueDensity).toBeGreaterThan(0.2);
  });

  it("computes average sentence length in characters", () => {
    const longResult = computeStyleMetrics([{ content: LONG_SENTENCE_PROSE }]);
    const shortResult = computeStyleMetrics([{ content: FIRST_PERSON_PROSE }]);
    expect(longResult.avgSentenceLengthChars).toBeGreaterThan(
      shortResult.avgSentenceLengthChars,
    );
    expect(longResult.avgSentenceLengthChars).toBeGreaterThan(50);
  });

  it("computes paragraph length variance", () => {
    const result = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    expect(result.paragraphLengthVariance).toBeGreaterThanOrEqual(0);
  });

  it("aggregates metrics across multiple scenes", () => {
    const single = computeStyleMetrics([{ content: FIRST_PERSON_PROSE }]);
    const multi = computeStyleMetrics([
      { content: FIRST_PERSON_PROSE },
      { content: FIRST_PERSON_PROSE },
    ]);
    expect(multi.firstPersonFreq).toBeCloseTo(single.firstPersonFreq, 2);
  });

  it("returns deterministic results", () => {
    const a = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    const b = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    expect(a).toEqual(b);
  });
});

describe("formatFingerprint", () => {
  it("labels first-person POV correctly", () => {
    const metrics = computeStyleMetrics([{ content: FIRST_PERSON_PROSE }]);
    const label = formatFingerprint(metrics);
    expect(label).toContain("ngôi thứ nhất");
  });

  it("labels third-person POV correctly", () => {
    const metrics = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    const label = formatFingerprint(metrics);
    expect(label).toContain("ngôi thứ ba");
  });

  it("labels dialogue-heavy prose correctly", () => {
    const metrics = computeStyleMetrics([{ content: DIALOGUE_HEAVY_PROSE }]);
    const label = formatFingerprint(metrics);
    expect(label).toContain("nhiều thoại");
  });

  it("returns a non-empty descriptor string", () => {
    const metrics = computeStyleMetrics([{ content: THIRD_PERSON_PROSE }]);
    const label = formatFingerprint(metrics);
    expect(label.length).toBeGreaterThan(10);
    expect(label).toMatch(/^\[Phong cách:/);
  });
});
