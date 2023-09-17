import { BulkGradeUpdater } from 'canvas-scripts';
import Grader from 'Grader';
import fs from 'fs/promises';
import Zip from 'adm-zip';

const canvasIdRegex = /^[^_]*?(?:_LATE|)_([0-9]+)/;

async function autoGrade(submissionsDir, assignmentConfig, GraderClass, canvasConfig) {
  if (assignmentConfig?.onlyCurrent) {
    const { grade, comments } = await new GraderClass(assignmentConfig).run();
    console.log(`Score: ${grade}`);
    console.error(comments);
    return;
  }
  const canvas = canvasConfig ?
    await new BulkGradeUpdater().setParameters(
      canvasConfig.apiKey,
      canvasConfig.courseId,
      canvasConfig.assignmentId
    ) : null;
  await fs.access(submissionsDir); // Confirms access to submissionsDir
  const subs = await fs.readdir(submissionsDir, { recursive: false });
  for (const sub of subs) {
    try {
      await fs.rm('current_submission', { recursive: true, force: true });
      const zip = new Zip(sub);
      zip.extractAllTo('current_submission');
      const { grade, comments } = await new GraderClass(assignmentConfig).run();
      console.log(`Graded ${sub}. Score: ${grade}`);
      if (!canvas) console.error(comments);
      else {
        if (canvasIdRegex.test(sub)) {
          const studentId = canvasIdRegex.exec(sub)[1];
          canvas.addStudent(studentId, grade, comments);
        } else {
          console.error('Failed to locate student canvas ID for submission. Upload comments manually:');
          console.error(comments || 'No comments.');
        }
      }
    } catch (e) {
      console.error(e);
      console.error(`Could not automatically grade submission '${sub}'.`);
    }
  }
};

export {
  autoGrade,
  Grader
};
