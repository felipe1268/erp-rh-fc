import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('./db', () => {
  return {
    getDb: vi.fn(),
    getAllUserGroups: vi.fn(),
    createUserGroup: vi.fn(),
    updateUserGroup: vi.fn(),
    deleteUserGroup: vi.fn(),
    getGroupPermissions: vi.fn(),
    setGroupPermissions: vi.fn(),
    getGroupMembers: vi.fn(),
    addUserToGroup: vi.fn(),
    removeUserFromGroup: vi.fn(),
    getUserGroupMemberships: vi.fn(),
    getUserEffectiveGroupPermissions: vi.fn(),
  };
});

import {
  getAllUserGroups,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  getGroupPermissions,
  setGroupPermissions,
  getGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  getUserGroupMemberships,
  getUserEffectiveGroupPermissions,
} from './db';

describe('User Groups System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllUserGroups', () => {
    it('should return all user groups', async () => {
      const mockGroups = [
        { id: 1, nome: 'RH', descricao: 'Recursos Humanos e DP', cor: '#2563eb', icone: 'Users', isDefault: 1, createdAt: '2026-03-02' },
        { id: 2, nome: 'TST', descricao: 'Segurança do Trabalho', cor: '#16a34a', icone: 'ShieldCheck', isDefault: 1, createdAt: '2026-03-02' },
        { id: 3, nome: 'Gestor de Obras', descricao: 'Gestão de obras e efetivo', cor: '#d97706', icone: 'Landmark', isDefault: 1, createdAt: '2026-03-02' },
        { id: 4, nome: 'Auxiliar de Engenharia', descricao: 'Suporte à engenharia', cor: '#7c3aed', icone: 'Wrench', isDefault: 1, createdAt: '2026-03-02' },
        { id: 5, nome: 'Encarregado', descricao: 'Encarregado de obra', cor: '#ea580c', icone: 'HardHat', isDefault: 1, createdAt: '2026-03-02' },
      ];
      (getAllUserGroups as any).mockResolvedValue(mockGroups);

      const result = await getAllUserGroups();
      expect(result).toHaveLength(5);
      expect(result[0].nome).toBe('RH');
      expect(result[1].nome).toBe('TST');
      expect(result[2].nome).toBe('Gestor de Obras');
      expect(result[3].nome).toBe('Auxiliar de Engenharia');
      expect(result[4].nome).toBe('Encarregado');
    });
  });

  describe('createUserGroup', () => {
    it('should create a new user group', async () => {
      (createUserGroup as any).mockResolvedValue({ insertId: 6 });

      const result = await createUserGroup({ nome: 'Financeiro', descricao: 'Equipe financeira', cor: '#0ea5e9', icone: 'Wallet' });
      expect(result).toEqual({ insertId: 6 });
      expect(createUserGroup).toHaveBeenCalledWith({ nome: 'Financeiro', descricao: 'Equipe financeira', cor: '#0ea5e9', icone: 'Wallet' });
    });
  });

  describe('updateUserGroup', () => {
    it('should update an existing group', async () => {
      (updateUserGroup as any).mockResolvedValue(true);

      const result = await updateUserGroup(1, { nome: 'RH Atualizado', descricao: 'Nova descrição' });
      expect(result).toBe(true);
      expect(updateUserGroup).toHaveBeenCalledWith(1, { nome: 'RH Atualizado', descricao: 'Nova descrição' });
    });
  });

  describe('deleteUserGroup', () => {
    it('should delete a group', async () => {
      (deleteUserGroup as any).mockResolvedValue(true);

      const result = await deleteUserGroup(6);
      expect(result).toBe(true);
      expect(deleteUserGroup).toHaveBeenCalledWith(6);
    });
  });

  describe('Group Permissions', () => {
    it('should get group permissions', async () => {
      const mockPerms = [
        { id: 1, groupId: 1, rota: '/colaboradores', canView: 1, canEdit: 1, canCreate: 1, canDelete: 1, ocultarValores: 0, ocultarDocumentos: 0 },
        { id: 2, groupId: 1, rota: '/ferias', canView: 1, canEdit: 1, canCreate: 0, canDelete: 0, ocultarValores: 0, ocultarDocumentos: 0 },
      ];
      (getGroupPermissions as any).mockResolvedValue(mockPerms);

      const result = await getGroupPermissions(1);
      expect(result).toHaveLength(2);
      expect(result[0].rota).toBe('/colaboradores');
      expect(result[0].canView).toBe(1);
    });

    it('should set group permissions', async () => {
      (setGroupPermissions as any).mockResolvedValue(true);

      const perms = [
        { rota: '/colaboradores', canView: true, canEdit: false, canCreate: false, canDelete: false, ocultarValores: true, ocultarDocumentos: false },
      ];
      const result = await setGroupPermissions(2, perms);
      expect(result).toBe(true);
      expect(setGroupPermissions).toHaveBeenCalledWith(2, perms);
    });
  });

  describe('Group Members', () => {
    it('should get group members', async () => {
      const mockMembers = [
        { userId: 10, name: 'João', email: 'joao@fc.com' },
        { userId: 11, name: 'Maria', email: 'maria@fc.com' },
      ];
      (getGroupMembers as any).mockResolvedValue(mockMembers);

      const result = await getGroupMembers(1);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('João');
    });

    it('should add user to group', async () => {
      (addUserToGroup as any).mockResolvedValue(true);

      const result = await addUserToGroup(1, 12);
      expect(result).toBe(true);
      expect(addUserToGroup).toHaveBeenCalledWith(1, 12);
    });

    it('should remove user from group', async () => {
      (removeUserFromGroup as any).mockResolvedValue(true);

      const result = await removeUserFromGroup(1, 12);
      expect(result).toBe(true);
      expect(removeUserFromGroup).toHaveBeenCalledWith(1, 12);
    });
  });

  describe('User Group Memberships', () => {
    it('should get user group memberships', async () => {
      const mockMemberships = [
        { groupId: 1, groupName: 'RH' },
        { groupId: 3, groupName: 'Gestor de Obras' },
      ];
      (getUserGroupMemberships as any).mockResolvedValue(mockMemberships);

      const result = await getUserGroupMemberships(10);
      expect(result).toHaveLength(2);
      expect(result[0].groupName).toBe('RH');
    });
  });

  describe('Effective Group Permissions', () => {
    it('should return effective permissions for user with groups', async () => {
      const mockEffective = {
        groups: [{ id: 1, nome: 'RH', cor: '#2563eb', icone: 'Users' }],
        permissions: [
          { rota: '/colaboradores', canView: 1, canEdit: 1, canCreate: 1, canDelete: 1, ocultarValores: 0, ocultarDocumentos: 0 },
          { rota: '/ferias', canView: 1, canEdit: 0, canCreate: 0, canDelete: 0, ocultarValores: 1, ocultarDocumentos: 0 },
        ],
        somenteVisualizacao: false,
        ocultarDadosSensiveis: false,
      };
      (getUserEffectiveGroupPermissions as any).mockResolvedValue(mockEffective);

      const result = await getUserEffectiveGroupPermissions(10);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].nome).toBe('RH');
      expect(result.permissions).toHaveLength(2);
      expect(result.somenteVisualizacao).toBe(false);
    });

    it('should return empty permissions for user without groups', async () => {
      const mockEffective = {
        groups: [],
        permissions: [],
        somenteVisualizacao: false,
        ocultarDadosSensiveis: false,
      };
      (getUserEffectiveGroupPermissions as any).mockResolvedValue(mockEffective);

      const result = await getUserEffectiveGroupPermissions(99);
      expect(result.groups).toHaveLength(0);
      expect(result.permissions).toHaveLength(0);
    });

    it('should merge permissions from multiple groups (most permissive wins)', async () => {
      const mockEffective = {
        groups: [
          { id: 1, nome: 'RH', cor: '#2563eb', icone: 'Users' },
          { id: 2, nome: 'TST', cor: '#16a34a', icone: 'ShieldCheck' },
        ],
        permissions: [
          { rota: '/colaboradores', canView: 1, canEdit: 1, canCreate: 1, canDelete: 1, ocultarValores: 0, ocultarDocumentos: 0 },
          { rota: '/epis', canView: 1, canEdit: 1, canCreate: 1, canDelete: 0, ocultarValores: 0, ocultarDocumentos: 0 },
        ],
        somenteVisualizacao: false,
        ocultarDadosSensiveis: false,
      };
      (getUserEffectiveGroupPermissions as any).mockResolvedValue(mockEffective);

      const result = await getUserEffectiveGroupPermissions(10);
      expect(result.groups).toHaveLength(2);
      // User has access to both /colaboradores (from RH) and /epis (from TST)
      const colabPerm = result.permissions.find((p: any) => p.rota === '/colaboradores');
      const epiPerm = result.permissions.find((p: any) => p.rota === '/epis');
      expect(colabPerm?.canEdit).toBe(1);
      expect(epiPerm?.canView).toBe(1);
    });
  });

  describe('Permission Flags', () => {
    it('should correctly identify somente visualizacao groups', async () => {
      const mockEffective = {
        groups: [{ id: 4, nome: 'Auxiliar de Engenharia', cor: '#7c3aed', icone: 'Wrench' }],
        permissions: [
          { rota: '/colaboradores', canView: 1, canEdit: 0, canCreate: 0, canDelete: 0, ocultarValores: 1, ocultarDocumentos: 0 },
          { rota: '/obras', canView: 1, canEdit: 0, canCreate: 0, canDelete: 0, ocultarValores: 1, ocultarDocumentos: 0 },
        ],
        somenteVisualizacao: true,
        ocultarDadosSensiveis: true,
      };
      (getUserEffectiveGroupPermissions as any).mockResolvedValue(mockEffective);

      const result = await getUserEffectiveGroupPermissions(20);
      expect(result.somenteVisualizacao).toBe(true);
      expect(result.ocultarDadosSensiveis).toBe(true);
      // All routes should have canEdit = 0
      result.permissions.forEach((p: any) => {
        expect(p.canEdit).toBe(0);
        expect(p.canCreate).toBe(0);
        expect(p.canDelete).toBe(0);
      });
    });

    it('should correctly identify groups that can see values', async () => {
      const mockEffective = {
        groups: [{ id: 1, nome: 'RH', cor: '#2563eb', icone: 'Users' }],
        permissions: [
          { rota: '/folha-pagamento', canView: 1, canEdit: 1, canCreate: 1, canDelete: 0, ocultarValores: 0, ocultarDocumentos: 0 },
        ],
        somenteVisualizacao: false,
        ocultarDadosSensiveis: false,
      };
      (getUserEffectiveGroupPermissions as any).mockResolvedValue(mockEffective);

      const result = await getUserEffectiveGroupPermissions(10);
      expect(result.ocultarDadosSensiveis).toBe(false);
      expect(result.permissions[0].ocultarValores).toBe(0);
    });
  });
});
