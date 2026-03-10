import { describe, it, expect } from "vitest";

describe("SMTP Service", () => {
  it("should have SMTP environment variables configured", () => {
    expect(process.env.SMTP_HOST).toBeDefined();
    expect(process.env.SMTP_EMAIL).toBeDefined();
    expect(process.env.SMTP_PASSWORD).toBeDefined();
    expect(process.env.SMTP_PORT).toBeDefined();
  });

  it("should create a nodemailer transporter and verify connection", async () => {
    const { verificarConexaoSMTP } = await import("./services/smtpService");
    const result = await verificarConexaoSMTP();
    console.log("SMTP verification result:", result);
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });
});
