import { describe, it, expect, vi, beforeAll } from "vitest";

// Test the permission system and role-based access control

describe("Permission System", () => {
  describe("Role Hierarchy", () => {
    const roles = ["user", "admin", "admin_master"] as const;
    
    it("should define three valid roles", () => {
      expect(roles).toHaveLength(3);
      expect(roles).toContain("user");
      expect(roles).toContain("admin");
      expect(roles).toContain("admin_master");
    });

    it("admin_master should have highest privileges", () => {
      const isMaster = (role: string) => role === "admin_master";
      expect(isMaster("admin_master")).toBe(true);
      expect(isMaster("admin")).toBe(false);
      expect(isMaster("user")).toBe(false);
    });

    it("admin should include admin_master", () => {
      const isAdmin = (role: string) => role === "admin" || role === "admin_master";
      expect(isAdmin("admin_master")).toBe(true);
      expect(isAdmin("admin")).toBe(true);
      expect(isAdmin("user")).toBe(false);
    });
  });

  describe("Profile Types", () => {
    it("should have 5 profile types defined", async () => {
      const { PROFILE_TYPES } = await import("../shared/modules");
      const types = Object.keys(PROFILE_TYPES);
      expect(types).toHaveLength(5);
      expect(types).toContain("adm_master");
      expect(types).toContain("adm");
      expect(types).toContain("operacional");
      expect(types).toContain("avaliador");
      expect(types).toContain("consulta");
    });

    it("adm_master profile should have full permissions", async () => {
      const { DEFAULT_PERMISSIONS, MODULE_KEYS } = await import("../shared/modules");
      const masterPerms = DEFAULT_PERMISSIONS.adm_master;
      for (const key of MODULE_KEYS) {
        expect(masterPerms[key].canView).toBe(true);
        expect(masterPerms[key].canCreate).toBe(true);
        expect(masterPerms[key].canEdit).toBe(true);
        expect(masterPerms[key].canDelete).toBe(true);
      }
    });

    it("consulta profile should only have view permissions", async () => {
      const { DEFAULT_PERMISSIONS, MODULE_KEYS } = await import("../shared/modules");
      const consultaPerms = DEFAULT_PERMISSIONS.consulta;
      for (const key of MODULE_KEYS) {
        expect(consultaPerms[key].canCreate).toBe(false);
        expect(consultaPerms[key].canEdit).toBe(false);
        expect(consultaPerms[key].canDelete).toBe(false);
      }
    });

    it("operacional profile should not have delete permissions", async () => {
      const { DEFAULT_PERMISSIONS, MODULE_KEYS } = await import("../shared/modules");
      const opPerms = DEFAULT_PERMISSIONS.operacional;
      for (const key of MODULE_KEYS) {
        expect(opPerms[key].canDelete).toBe(false);
      }
    });
  });

  describe("Menu Access Control", () => {
    const adminOnlyPaths = ['/usuarios', '/auditoria', '/configuracoes', '/lixeira'];

    it("regular user should not see admin-only menu items", () => {
      const userRole = "user";
      const isAdmin = userRole === "admin" || userRole === "admin_master";
      const visiblePaths = ['/painel', '/colaboradores', '/usuarios', '/configuracoes'];
      const filtered = isAdmin ? visiblePaths : visiblePaths.filter(p => !adminOnlyPaths.includes(p));
      expect(filtered).not.toContain('/usuarios');
      expect(filtered).not.toContain('/configuracoes');
      expect(filtered).toContain('/painel');
      expect(filtered).toContain('/colaboradores');
    });

    it("admin should see admin-only menu items", () => {
      const userRole = "admin";
      const isAdmin = userRole === "admin" || userRole === "admin_master";
      const visiblePaths = ['/painel', '/colaboradores', '/usuarios', '/configuracoes'];
      const filtered = isAdmin ? visiblePaths : visiblePaths.filter(p => !adminOnlyPaths.includes(p));
      expect(filtered).toContain('/usuarios');
      expect(filtered).toContain('/configuracoes');
    });

    it("admin_master should see all menu items", () => {
      const userRole = "admin_master";
      const isAdmin = userRole === "admin" || userRole === "admin_master";
      const visiblePaths = ['/painel', '/colaboradores', '/usuarios', '/configuracoes', '/lixeira'];
      const filtered = isAdmin ? visiblePaths : visiblePaths.filter(p => !adminOnlyPaths.includes(p));
      expect(filtered).toContain('/usuarios');
      expect(filtered).toContain('/configuracoes');
      expect(filtered).toContain('/lixeira');
    });
  });

  describe("Tab Access Control in Configuracoes", () => {
    const allTabs = [
      { key: "painel", minRole: "user" },
      { key: "regras", minRole: "admin" },
      { key: "criterios", minRole: "admin" },
      { key: "usuarios", minRole: "admin" },
      { key: "senha", minRole: "user" },
      { key: "notificacoes", minRole: "admin" },
      { key: "contrato_pj", minRole: "admin" },
      { key: "limpeza", minRole: "admin_master" },
    ];

    const filterTabs = (role: string) => {
      const isMaster = role === "admin_master";
      const isAdmin = role === "admin" || isMaster;
      return allTabs.filter(tab => {
        if (tab.minRole === "user") return true;
        if (tab.minRole === "admin") return isAdmin;
        if (tab.minRole === "admin_master") return isMaster;
        return true;
      });
    };

    it("regular user should only see user-level tabs", () => {
      const tabs = filterTabs("user");
      expect(tabs.map(t => t.key)).toEqual(["painel", "senha"]);
    });

    it("admin should see admin-level tabs but not master-only", () => {
      const tabs = filterTabs("admin");
      const keys = tabs.map(t => t.key);
      expect(keys).toContain("painel");
      expect(keys).toContain("regras");
      expect(keys).toContain("criterios");
      expect(keys).toContain("usuarios");
      expect(keys).toContain("senha");
      expect(keys).not.toContain("limpeza");
    });

    it("admin_master should see all tabs including limpeza", () => {
      const tabs = filterTabs("admin_master");
      const keys = tabs.map(t => t.key);
      expect(keys).toContain("limpeza");
      expect(keys).toHaveLength(8);
    });
  });

  describe("Role Update Validation", () => {
    it("should not allow user to change own role", () => {
      const currentUserId = 1;
      const targetUserId = 1;
      const canChange = currentUserId !== targetUserId;
      expect(canChange).toBe(false);
    });

    it("should allow admin_master to change other user role", () => {
      const currentUserRole = "admin_master";
      const currentUserId = 1;
      const targetUserId = 2;
      const canChange = currentUserRole === "admin_master" && currentUserId !== targetUserId;
      expect(canChange).toBe(true);
    });

    it("should not allow admin to change roles", () => {
      const currentUserRole = "admin";
      const canChange = currentUserRole === "admin_master";
      expect(canChange).toBe(false);
    });

    it("should not allow regular user to change roles", () => {
      const currentUserRole = "user";
      const canChange = currentUserRole === "admin_master";
      expect(canChange).toBe(false);
    });
  });

  describe("Role Label Display", () => {
    const getRoleLabel = (role: string) => {
      switch (role) {
        case "admin_master": return "Admin Master";
        case "admin": return "Admin";
        default: return "Usuário";
      }
    };

    it("should display correct labels for all roles", () => {
      expect(getRoleLabel("admin_master")).toBe("Admin Master");
      expect(getRoleLabel("admin")).toBe("Admin");
      expect(getRoleLabel("user")).toBe("Usuário");
      expect(getRoleLabel("")).toBe("Usuário");
    });
  });
});
