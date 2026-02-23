import { describe, it, expect } from "vitest";

/**
 * Tests for the desconsolidar permission logic.
 * The actual permission check in fechamentoPonto.ts is:
 *   const userRole = (ctx.user.role || '').toString().trim().toLowerCase();
 *   const isOwner = ctx.user.openId === process.env.OWNER_OPEN_ID;
 *   const isAdmin = userRole.includes('admin');
 *   const isAllowed = isAdmin || isOwner;
 */

function checkDesconsolidarPermission(role: string | null | undefined, openId: string, ownerOpenId: string): boolean {
  const userRole = (role || '').toString().trim().toLowerCase();
  const isOwner = openId === ownerOpenId;
  const isAdmin = userRole.includes('admin');
  return isAdmin || isOwner;
}

describe("Desconsolidar Permission Check", () => {
  const OWNER_OPEN_ID = "JEMA66m7MhqSFfpAbPWgBv";

  it("should allow admin_master role", () => {
    expect(checkDesconsolidarPermission("admin_master", "some-id", OWNER_OPEN_ID)).toBe(true);
  });

  it("should allow admin role", () => {
    expect(checkDesconsolidarPermission("admin", "some-id", OWNER_OPEN_ID)).toBe(true);
  });

  it("should allow owner even with user role", () => {
    expect(checkDesconsolidarPermission("user", OWNER_OPEN_ID, OWNER_OPEN_ID)).toBe(true);
  });

  it("should allow owner even with null role", () => {
    expect(checkDesconsolidarPermission(null, OWNER_OPEN_ID, OWNER_OPEN_ID)).toBe(true);
  });

  it("should allow owner even with undefined role", () => {
    expect(checkDesconsolidarPermission(undefined, OWNER_OPEN_ID, OWNER_OPEN_ID)).toBe(true);
  });

  it("should deny regular user who is not owner", () => {
    expect(checkDesconsolidarPermission("user", "other-id", OWNER_OPEN_ID)).toBe(false);
  });

  it("should deny null role who is not owner", () => {
    expect(checkDesconsolidarPermission(null, "other-id", OWNER_OPEN_ID)).toBe(false);
  });

  it("should deny empty string role who is not owner", () => {
    expect(checkDesconsolidarPermission("", "other-id", OWNER_OPEN_ID)).toBe(false);
  });

  it("should handle admin_master with extra whitespace", () => {
    expect(checkDesconsolidarPermission(" admin_master ", "some-id", OWNER_OPEN_ID)).toBe(true);
  });

  it("should handle ADMIN_MASTER uppercase", () => {
    expect(checkDesconsolidarPermission("ADMIN_MASTER", "some-id", OWNER_OPEN_ID)).toBe(true);
  });

  it("should handle Admin mixed case", () => {
    expect(checkDesconsolidarPermission("Admin", "some-id", OWNER_OPEN_ID)).toBe(true);
  });
});
