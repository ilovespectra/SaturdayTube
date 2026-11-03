const path = require('node:path');

const CANDIDATE_EXECUTABLE = 'Saturday Tube Candidate';

function configureAppIdentity({ app, env = process.env, executablePath = process.execPath } = {}) {
  const isCandidateBuild = app.isPackaged === true && path.basename(executablePath) === CANDIDATE_EXECUTABLE;
  const isQaBuild = env.SATURDAY_TUBE_QA === '1';
  const displayName = isQaBuild
    ? 'Saturday Tube QA'
    : isCandidateBuild
      ? CANDIDATE_EXECUTABLE
      : app.isPackaged
        ? app.getName()
        : 'Saturday Tube Dev';

  // Electron derives macOS userData from the app name, so set the candidate identity before asking for any profile path.
  app.setName(displayName);
  let userDataPath = null;
  if (isCandidateBuild) {
    const requestedPath = env.SATURDAY_TUBE_CANDIDATE_PROFILE_DIR;
    userDataPath = path.resolve(requestedPath?.trim() || path.join(app.getPath('appData'), displayName));
    app.setPath('userData', userDataPath);
  }

  return { displayName, isCandidateBuild, userDataPath };
}

module.exports = { configureAppIdentity };
