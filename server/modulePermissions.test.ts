import { describe, it, expect } from "vitest";
import { MODULE_DEFINITIONS } from "../shared/modules";

describe("Module Permissions System", () => {
  describe("MODULE_DEFINITIONS structure", () => {
    it("should have at least 3 modules defined (RH, SST, Juridico)", () => {
      expect(MODULE_DEFINITIONS.length).toBeGreaterThanOrEqual(3);
      const ids = MODULE_DEFINITIONS.map(m => m.id);
      expect(ids).toContain("rh-dp");
      expect(ids).toContain("sst");
      expect(ids).toContain("juridico");
    });

    it("each module should have required fields", () => {
      for (const mod of MODULE_DEFINITIONS) {
        expect(mod.id).toBeTruthy();
        expect(mod.label).toBeTruthy();
        expect(mod.description).toBeTruthy();
        expect(mod.color).toBeTruthy();
        expect(Array.isArray(mod.features)).toBe(true);
        expect(mod.features.length).toBeGreaterThan(0);
      }
    });

    it("each feature should have key and label", () => {
      for (const mod of MODULE_DEFINITIONS) {
        for (const feat of mod.features) {
          expect(feat.key).toBeTruthy();
          expect(feat.label).toBeTruthy();
          expect(typeof feat.key).toBe("string");
          expect(typeof feat.label).toBe("string");
        }
      }
    });

    it("feature keys should be unique within each module", () => {
      for (const mod of MODULE_DEFINITIONS) {
        const keys = mod.features.map(f => f.key);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
      }
    });

    it("module ids should be unique", () => {
      const ids = MODULE_DEFINITIONS.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("RH module features", () => {
    it("should include core RH features", () => {
      const rh = MODULE_DEFINITIONS.find(m => m.id === "rh-dp");
      expect(rh).toBeDefined();
      const featureKeys = rh!.features.map(f => f.key);
      expect(featureKeys).toContain("colaboradores");
      expect(featureKeys).toContain("fechamento-ponto");
      expect(featureKeys).toContain("folha-pagamento");
    });
  });

  describe("SST module features", () => {
    it("should include core SST features", () => {
      const sst = MODULE_DEFINITIONS.find(m => m.id === "sst");
      expect(sst).toBeDefined();
      const featureKeys = sst!.features.map(f => f.key);
      expect(featureKeys).toContain("epis");
      expect(featureKeys).toContain("cipa");
    });
  });

  describe("Juridico module features", () => {
    it("should include core Juridico features", () => {
      const jur = MODULE_DEFINITIONS.find(m => m.id === "juridico");
      expect(jur).toBeDefined();
      const featureKeys = jur!.features.map(f => f.key);
      expect(featureKeys).toContain("processos-trabalhistas");
    });
  });

  describe("Permission data structure", () => {
    it("should be able to create a permissions map from MODULE_DEFINITIONS", () => {
      const permsMap: Record<string, Record<string, boolean>> = {};
      for (const mod of MODULE_DEFINITIONS) {
        permsMap[mod.id] = {};
        for (const feat of mod.features) {
          permsMap[mod.id][feat.key] = false;
        }
      }
      expect(Object.keys(permsMap).length).toBe(MODULE_DEFINITIONS.length);
      for (const mod of MODULE_DEFINITIONS) {
        expect(Object.keys(permsMap[mod.id]).length).toBe(mod.features.length);
      }
    });

    it("should be able to toggle all features of a module", () => {
      const permsMap: Record<string, Record<string, boolean>> = {};
      const mod = MODULE_DEFINITIONS[0];
      permsMap[mod.id] = {};
      for (const feat of mod.features) {
        permsMap[mod.id][feat.key] = true;
      }
      const allEnabled = mod.features.every(f => permsMap[mod.id][f.key]);
      expect(allEnabled).toBe(true);
    });

    it("should be able to serialize permissions to array format", () => {
      const permsList: { moduleId: string; featureKey: string; canAccess: boolean }[] = [];
      for (const mod of MODULE_DEFINITIONS) {
        for (const feat of mod.features) {
          permsList.push({ moduleId: mod.id, featureKey: feat.key, canAccess: true });
        }
      }
      expect(permsList.length).toBeGreaterThan(0);
      expect(permsList[0]).toHaveProperty("moduleId");
      expect(permsList[0]).toHaveProperty("featureKey");
      expect(permsList[0]).toHaveProperty("canAccess");
    });
  });
});
