const request = require("supertest");
const app = require("./app");

describe("Sersa API Health Check", () => {
  test("GET /api/health should return status 200", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      application: "Sersa API",
    });
  });
});