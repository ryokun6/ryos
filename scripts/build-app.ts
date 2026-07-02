const buildEnvironment = {
  ...process.env,
  NODE_ENV: "production",
};

const jobs = [
  {
    name: "typecheck",
    command: ["bun", "run", "typecheck"],
  },
  {
    name: "bundle",
    command: ["bun", "run", "build:vite"],
  },
] as const;

const runningJobs = jobs.map(({ name, command }) => ({
  name,
  process: Bun.spawn(command, {
    cwd: process.cwd(),
    env: buildEnvironment,
    stdout: "inherit",
    stderr: "inherit",
  }),
}));

const results = await Promise.all(
  runningJobs.map(async ({ name, process: child }) => ({
    name,
    exitCode: await child.exited,
  }))
);

const failedJobs = results.filter(({ exitCode }) => exitCode !== 0);
if (failedJobs.length > 0) {
  for (const { name, exitCode } of failedJobs) {
    console.error(`[build] ${name} failed with exit code ${exitCode}`);
  }
  process.exit(1);
}
