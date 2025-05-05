async function seedRateLimitSettings() {
  const rateLimitSettings = [
    {
      key: "rate_limit.default.max",
      value: "100",
      description:
        "Maximum number of requests per window for default endpoints",
    },
    {
      key: "rate_limit.default.window_ms",
      value: "900000", // 15 minutes in milliseconds
      description: "Time window for default rate limiting in milliseconds",
    },
    {
      key: "rate_limit.auth.max",
      value: "20",
      description:
        "Maximum number of requests per window for authentication endpoints",
    },
    {
      key: "rate_limit.auth.window_ms",
      value: "3600000", // 1 hour in milliseconds
      description:
        "Time window for authentication rate limiting in milliseconds",
    },
    {
      key: "rate_limit.transactions.max",
      value: "50",
      description:
        "Maximum number of requests per window for transaction endpoints",
    },
    {
      key: "rate_limit.transactions.window_ms",
      value: "3600000", // 1 hour in milliseconds
      description: "Time window for transaction rate limiting in milliseconds",
    },
    {
      key: "rate_limit.profile.max",
      value: "30",
      description:
        "Maximum number of requests per window for profile endpoints",
    },
    {
      key: "rate_limit.profile.window_ms",
      value: "3600000", // 1 hour in milliseconds
      description: "Time window for profile rate limiting in milliseconds",
    },
  ];

  for (const setting of rateLimitSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });
  }

  console.log("Rate limit settings seeded successfully");
}

seedRateLimitSettings()
  .catch((error) => {
    console.error("Error seeding rate limit settings:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
