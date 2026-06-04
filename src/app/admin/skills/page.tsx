import { getFinleyDraftSkillCatalogue } from "@/lib/finley-draft-skills";

import styles from "../admin.module.css";

const PROMOTE_ACTION_LABELS: Record<string, string> = {
  copy: "Copy",
  file_note: "Use draft in File Note",
  save_draft: "Save Draft",
};

export default function AdminSkillsPage() {
  const skills = getFinleyDraftSkillCatalogue();

  return (
    <section className={styles.contentCard}>
      <div className={styles.contentCardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Finley Skills</h2>
          <p className={styles.cardText}>
            App-coded draft skills available in the Finley AI console. Skills draft structured adviser outputs only and do not save client records.
          </p>
        </div>
        <span className={styles.badge}>
          {skills.length} {skills.length === 1 ? "skill" : "skills"}
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Skill</th>
              <th>Status</th>
              <th>Context sources</th>
              <th>Output type</th>
              <th>Promote actions</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>
                  <strong>{skill.displayName}</strong>
                  <p className={styles.tableSubtext}>{skill.description}</p>
                </td>
                <td>
                  <span className={`${styles.statusPill} ${styles.statusPillAdmin}`}>{skill.status}</span>
                </td>
                <td>
                  <div className={styles.templateSectionList}>
                    {skill.allowedContextSources.map((source) => (
                      <span key={source} className={styles.templateSectionPill}>
                        {source}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{skill.outputType}</td>
                <td>
                  <div className={styles.templateSectionList}>
                    {skill.allowedPromoteActions.map((action) => (
                      <span key={action} className={styles.templateSectionPill}>
                        {PROMOTE_ACTION_LABELS[action] ?? action}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.templateGuideCard}>
        <h3>Future custom skills</h3>
        <p>
          V1 skills are read-only and app-coded. The registry shape is designed so V2 can move skill definitions into admin-managed configuration for
          licensee, practice, or adviser draft workflows.
        </p>
      </div>
    </section>
  );
}
