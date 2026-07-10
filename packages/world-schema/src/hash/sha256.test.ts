import { describe, it, expect } from "vitest";
import { sha256, sha256Hex, bytesToHex, utf8, readUint32BE } from "./sha256.js";

describe("sha256 — vecteurs officiels", () => {
  it('digest de "" (chaîne vide)', () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('digest de "abc"', () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("digest du message de 448 bits (NIST)", () => {
    const msg = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    expect(msg.length).toBe(56); // 448 bits
    expect(sha256Hex(msg)).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("digest sur exactement un bloc-limite (55 puis 56 octets)", () => {
    // 55 octets : rembourrage tient dans un bloc ; 56 : déborde sur deux blocs.
    expect(sha256Hex("a".repeat(55))).toBe(
      "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
    );
    expect(sha256Hex("a".repeat(56))).toBe(
      "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
    );
  });

  it("rend 32 octets", () => {
    expect(sha256(utf8("anything")).length).toBe(32);
  });
});

describe("readUint32BE", () => {
  it("lit un entier 32 bits big-endian", () => {
    const b = Uint8Array.of(0x12, 0x34, 0x56, 0x78, 0xff);
    expect(readUint32BE(b, 0)).toBe(0x12345678);
    expect(readUint32BE(b, 1)).toBe(0x345678ff);
  });

  it("rend une valeur non signée", () => {
    const b = Uint8Array.of(0xff, 0xff, 0xff, 0xff);
    expect(readUint32BE(b, 0)).toBe(0xffffffff);
    expect(readUint32BE(b, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("bytesToHex", () => {
  it("zéro-remplit chaque octet", () => {
    expect(bytesToHex(Uint8Array.of(0, 1, 15, 16, 255))).toBe("00010f10ff");
  });
});
