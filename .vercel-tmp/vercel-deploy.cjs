#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const isWindows = os.platform() === 'win32';
const ALLOWED_COMMANDS = new Set(['vercel', 'npm', 'pnpm', 'yarn']);
function log(msg) { console.error(msg); }
function commandExists(cmd) {
  if (!ALLOWED_COMMANDS.has(cmd)) throw new Error(`Command not in whitelist: ${cmd}`);
  try {
    if (isWindows) { return spawnSync('where', [cmd], { stdio: 'ignore' }).status === 0; }
    else { return spawnSync('sh', ['-c', `command -v "$1"`, '--', cmd], { stdio: 'ignore' }).status === 0; }
  } catch { return false; }
}
function getCommandOutput(cmd, args) {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: isWindows });
    return result.status === 0 ? (result.stdout || '').trim() : null;
  } catch { return null; }
}
function parseArgs(args) {
  const result = { projectPath: '.', prod: true, yes: false, skipBuild: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prod') result.prod = true;
    else if (arg === '--yes' || arg === '-y') result.yes = true;
    else if (arg === '--skip-build') result.skipBuild = true;
    else if (!arg.startsWith('-')) result.projectPath = arg;
    else { log(`Unknown option: ${arg}`); process.exit(1); }
  }
  return result;
}
function checkVercelInstalled() {
  if (!commandExists('vercel')) { log('Error: Vercel CLI is not installed'); process.exit(1); }
  log(`Vercel CLI version: ${getCommandOutput('vercel', ['--version']) || 'unknown'}`);
}
function checkLoginStatus() {
  log('Checking login status...');
  try {
    const result = spawnSync('vercel', ['whoami'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], shell: isWindows });
    const output = (result.stdout || '').trim();
    if (result.status === 0 && output && !output.includes('Error')) { log(`Logged in as: ${output}`); return true; }
  } catch {}
  return false;
}
function checkProject(projectPath) {
  const absPath = path.resolve(projectPath);
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) { log(`Error: Project directory does not exist: ${absPath}`); process.exit(1); }
  log(`Project path: ${absPath}`);
  return absPath;
}
function detectPackageManager(projectPath) {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) return 'npm';
  if (commandExists('pnpm')) return 'pnpm';
  if (commandExists('yarn')) return 'yarn';
  if (commandExists('npm')) return 'npm';
  return null;
}
function runBuildIfNeeded(projectPath) {
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) { log('No package.json found, skipping build'); return true; }
  let packageJson;
  try { packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')); } catch { return true; }
  if (!packageJson.scripts || !packageJson.scripts.build) { log('No build script found, skipping'); return true; }
  log('\n========================================');
  log('Running pre-deployment build...');
  log('========================================\n');
  const pkgManager = detectPackageManager(projectPath);
  if (!pkgManager) { log('Error: No package manager found'); process.exit(1); }
  log(`Using: ${pkgManager}`);
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    log('Installing dependencies...');
    const installArgs = pkgManager === 'yarn' ? [] : ['install'];
    const result = spawnSync(pkgManager, installArgs, { cwd: projectPath, stdio: 'inherit', shell: isWindows });
    if (result.status !== 0) { log('Error: Failed to install dependencies'); process.exit(1); }
  }
  const buildArgs = pkgManager === 'npm' ? ['run', 'build'] : ['build'];
  log(`Executing: ${pkgManager} ${buildArgs.join(' ')}\n`);
  const result = spawnSync(pkgManager, buildArgs, { cwd: projectPath, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) { log('\nBuild FAILED!'); process.exit(1); }
  log('\nBuild completed successfully!');
  return true;
}
function doDeploy(projectPath, options) {
  log('\nStarting deployment...\n');
  const args = [];
  if (options.yes) args.push('--yes');
  if (options.prod) { args.push('--prod'); log('Environment: Production'); }
  else { log('Environment: Preview'); }
  log(`Executing: vercel ${args.join(' ')}\n`);
  log('========================================');
  try {
    const result = spawnSync('vercel', args, { cwd: projectPath, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], timeout: 300000, shell: isWindows });
    const output = (result.stdout || '') + (result.stderr || '');
    log(output);
    if (result.status !== 0) throw new Error('Deployment failed');
    const aliasedMatch = output.match(/Aliased:\s*(https:\/\/[a-zA-Z0-9.-]+\.vercel\.app)/i);
    const deploymentMatch = output.match(/Production:\s*(https:\/\/[a-zA-Z0-9.-]+\.vercel\.app)/i);
    const finalUrl = (aliasedMatch && aliasedMatch[1]) || (deploymentMatch && deploymentMatch[1]);
    log('\n========================================');
    log('Deployment successful!');
    log('========================================\n');
    if (finalUrl) { log(`Your site is live: ${finalUrl}\n`); console.log(JSON.stringify({ status: 'success', url: finalUrl })); }
    else { console.log(JSON.stringify({ status: 'success', message: 'Deployment successful' })); }
  } catch (error) { log(error.message || ''); log('\nDeployment failed'); process.exit(1); }
}
function main() {
  log('========================================');
  log('Vercel CLI Project Deployment');
  log('========================================\n');
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  checkVercelInstalled();
  log('');
  if (!checkLoginStatus()) { log('\nError: Not logged in'); process.exit(1); }
  log('');
  const projectPath = checkProject(options.projectPath);
  if (!options.skipBuild) { runBuildIfNeeded(projectPath); }
  else { log('Build step skipped (--skip-build flag)'); }
  doDeploy(projectPath, options);
}
main();
