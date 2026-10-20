import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// =====================================================================
// CTG candidate-review PDF.
//
// Layout follows a client-ready review template: a
// banner across the top, a title block + Key Takeaways callout, a
// six-column candidate table, and a three-up Ranking / Next Steps /
// Notes panel at the bottom. The footer shows "Prepared by" + a page
// counter so multi-page documents stay legible when sent to clients.
//
// Helvetica is the @react-pdf/renderer default, which is good enough
// for an internal document - no custom font registration needed and
// no risk of missing-font failures on Vercel Fluid Compute.
// =====================================================================

// Default behavior in @react-pdf/renderer is to wrap only at
// whitespace, which is fine for most bullets but causes very long
// single words ("Cybersecurity", "Counterintelligence") to overflow
// narrow table cells. A per-character callback caused mid-word
// truncation in production output; this conservative callback only
// breaks words longer than 12 characters, into ~6-char chunks, so
// short words stay intact while overflow-risk words wrap cleanly.
Font.registerHyphenationCallback((word) => {
  if (word.length <= 12) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += 6) {
    parts.push(word.slice(i, i + 6));
  }
  return parts;
});

const COLORS = {
  ink: "#0b1320",
  inkSoft: "#4a5567",
  inkMuted: "#7a8597",
  border: "#d0d7e2",
  borderSoft: "#e6ebf2",
  panel: "#f6f9f6",
  panelBorder: "#cfe3d0",
  accent: "#117a3d",
  accentSoft: "#e7f3ec",
  pipFill: "#16a34a",
  pipEmpty: "#dbeadc",
  rowAlt: "#f8fafc",
};

export type PdfRoleFit = {
  jobId: string;
  jobTitle: string;
  score: number | null;
};

export type PdfCandidateRow = {
  candidateId: string;
  name: string;
  location: string | null;
  militaryBranch: string | null;
  rank: string | null;
  background: string[];
  strengths: string[];
  areasToValidate: string[];
  interviewFocus: string[];
  roleFits: PdfRoleFit[];
};

export type PdfNarrative = {
  keyTakeaways: string[];
  nextSteps: string[];
  notes: string[];
};

export type PdfRanking = {
  jobId: string;
  jobTitle: string;
  orderedCandidateNames: string[];
};

export type PdfDocumentInput = {
  companyName: string;
  preparedByName: string | null;
  generatedAt: Date;
  narrative: PdfNarrative;
  rows: PdfCandidateRow[];
  rankings: PdfRanking[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 18,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    lineHeight: 1.35,
  },
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1pt solid ${COLORS.border}`,
    paddingBottom: 6,
    marginBottom: 10,
  },
  bannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bannerBrand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.ink,
  },
  bannerSubtitle: {
    fontSize: 8,
    color: COLORS.inkMuted,
  },
  bannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerMeta: {
    fontSize: 8,
    color: COLORS.inkMuted,
  },
  titleBlock: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
  },
  titleLeft: {
    flex: 1.4,
  },
  titleHeading: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#0d3b66",
    marginBottom: 6,
  },
  titleBody: {
    fontSize: 9,
    color: COLORS.inkSoft,
  },
  takeawaysCard: {
    flex: 1,
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.panelBorder,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  takeawaysHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  table: {
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 3,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0d3b66",
  },
  tableHeaderCell: {
    paddingVertical: 5,
    paddingHorizontal: 5,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    borderTop: `0.5pt solid ${COLORS.borderSoft}`,
  },
  tableRowAlt: {
    backgroundColor: COLORS.rowAlt,
  },
  tableCell: {
    paddingVertical: 6,
    paddingHorizontal: 5,
    fontSize: 9,
  },
  candidateName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0d3b66",
  },
  candidateLocation: {
    fontSize: 8.5,
    color: COLORS.inkMuted,
    marginTop: 1,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 1.5,
  },
  bulletDot: {
    width: 7,
    fontSize: 9,
    color: COLORS.inkSoft,
  },
  bulletText: {
    flex: 1,
    fontSize: 8.5,
    color: COLORS.ink,
  },
  emptyDash: {
    fontSize: 8.5,
    fontStyle: "italic",
    color: COLORS.inkMuted,
  },
  roleFitGroup: {
    marginBottom: 5,
  },
  roleFitLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  pipRow: {
    flexDirection: "row",
    gap: 3,
    alignItems: "center",
  },
  pip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 0.75,
    borderColor: COLORS.pipFill,
  },
  pipFill: {
    backgroundColor: COLORS.pipFill,
  },
  pipEmpty: {
    backgroundColor: COLORS.pipEmpty,
  },
  bottomGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  panelCard: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderColor: COLORS.panelBorder,
    borderWidth: 1,
    borderRadius: 3,
    padding: 8,
  },
  panelHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rankingRow: {
    marginBottom: 6,
  },
  rankingLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 1.5,
  },
  rankPill: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
    color: "#ffffff",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 2,
    marginRight: 4,
  },
  rankName: {
    fontSize: 8,
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.inkMuted,
    paddingTop: 6,
    borderTop: `0.5pt solid ${COLORS.borderSoft}`,
  },
});

// Column proportions tuned so a 6-candidate × 2-job table fits on one
// Letter page at the chosen font size. Widths sum to 100.
// Bumped widths on text-heavy columns after testing showed
// mid-word truncation; the narrow margins (18pt left/right) give the
// table ~580pt of usable width - wide enough that 7-word bullets
// like "Cybersecurity Strategy, Finance" sit on one line at 8.5pt.
const COL_WIDTHS = {
  candidate: 12,
  background: 19,
  strengths: 18,
  areas: 18,
  roleFit: 14,
  focus: 19,
};

function Pip({ filled }: { filled: boolean }) {
  return (
    <View
      style={[styles.pip, filled ? styles.pipFill : styles.pipEmpty]}
    />
  );
}

function PipRow({ score }: { score: number | null }) {
  const filled = score == null ? 0 : Math.round(Math.max(0, Math.min(3, score)));
  return (
    <View style={styles.pipRow}>
      <Pip filled={filled >= 1} />
      <Pip filled={filled >= 2} />
      <Pip filled={filled >= 3} />
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <Text style={styles.emptyDash}>-</Text>;
  }
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function CandidateReviewPdf({ input }: { input: PdfDocumentInput }) {
  const dateLabel = formatDate(input.generatedAt);

  return (
    <Document
      title={`${input.companyName} Candidate Review - ${dateLabel}`}
      author="Command Talent Group"
      subject={`Candidate Review for ${input.companyName}`}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Top banner - CTG/client brand + date + classification */}
        <View style={styles.banner} fixed>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerBrand}>
              CTG &amp; {input.companyName}
            </Text>
            <Text style={styles.bannerSubtitle}>Candidate Review Notes</Text>
          </View>
          <View style={styles.bannerRight}>
            <Text style={styles.bannerMeta}>{dateLabel}</Text>
            <Text style={styles.bannerMeta}>·</Text>
            <Text style={styles.bannerMeta}>Internal Use Only</Text>
          </View>
        </View>

        {/* Title + Key Takeaways callout */}
        <View style={styles.titleBlock}>
          <View style={styles.titleLeft}>
            <Text style={styles.titleHeading}>
              {input.companyName.toUpperCase()} CANDIDATE REVIEW
            </Text>
            <Text style={styles.titleBody}>
              Summary of resumes reviewed for the open roles below. Focus areas
              include relevant experience, strengths, areas to validate, role
              fit, and interview focus.
            </Text>
          </View>
          <View style={styles.takeawaysCard}>
            <Text style={styles.takeawaysHeading}>Key Takeaways</Text>
            <Bullets items={input.narrative.keyTakeaways} />
          </View>
        </View>

        {/* Candidate table */}
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.candidate}%` }]}
            >
              Candidate &amp; Location
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.background}%` }]}
            >
              Background Summary
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.strengths}%` }]}
            >
              Strengths
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.areas}%` }]}
            >
              Areas to Validate
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.roleFit}%` }]}
            >
              Role Fit
            </Text>
            <Text
              style={[styles.tableHeaderCell, { width: `${COL_WIDTHS.focus}%` }]}
            >
              Interview Focus
            </Text>
          </View>

          {input.rows.map((row, idx) => (
            <View
              key={row.candidateId}
              style={[
                styles.tableRow,
                idx % 2 === 1 ? styles.tableRowAlt : {},
              ]}
              wrap={false}
            >
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.candidate}%` }]}
              >
                <Text style={styles.candidateName}>{row.name}</Text>
                {row.location ? (
                  <Text style={styles.candidateLocation}>{row.location}</Text>
                ) : null}
                {row.militaryBranch || row.rank ? (
                  <Text style={styles.candidateLocation}>
                    {[row.militaryBranch, row.rank].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.background}%` }]}
              >
                <Bullets items={row.background} />
              </View>
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.strengths}%` }]}
              >
                <Bullets items={row.strengths} />
              </View>
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.areas}%` }]}
              >
                <Bullets items={row.areasToValidate} />
              </View>
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.roleFit}%` }]}
              >
                {row.roleFits.length === 0 ? (
                  <Text style={styles.emptyDash}>-</Text>
                ) : (
                  row.roleFits.map((fit) => (
                    <View key={fit.jobId} style={styles.roleFitGroup}>
                      <Text style={styles.roleFitLabel}>{fit.jobTitle}</Text>
                      <PipRow score={fit.score} />
                    </View>
                  ))
                )}
              </View>
              <View
                style={[styles.tableCell, { width: `${COL_WIDTHS.focus}%` }]}
              >
                <Bullets items={row.interviewFocus} />
              </View>
            </View>
          ))}
        </View>

        {/* Bottom 3-up - Ranking / Next Steps / Notes */}
        <View style={styles.bottomGrid} wrap={false}>
          <View style={styles.panelCard}>
            <Text style={styles.panelHeading}>Ranking Summary</Text>
            {input.rankings.length === 0 ? (
              <Text style={styles.emptyDash}>-</Text>
            ) : (
              input.rankings.map((r) => (
                <View key={r.jobId} style={styles.rankingRow}>
                  <Text style={styles.rankingLabel}>
                    Best fit for {r.jobTitle}
                  </Text>
                  {r.orderedCandidateNames.length === 0 ? (
                    <Text style={styles.emptyDash}>-</Text>
                  ) : (
                    r.orderedCandidateNames.map((name, i) => (
                      <View key={`${r.jobId}-${i}`} style={styles.rankItem}>
                        <Text style={styles.rankPill}>{i + 1}</Text>
                        <Text style={styles.rankName}>{name}</Text>
                      </View>
                    ))
                  )}
                </View>
              ))
            )}
          </View>
          <View style={styles.panelCard}>
            <Text style={styles.panelHeading}>Next Steps</Text>
            <Bullets items={input.narrative.nextSteps} />
          </View>
          <View style={styles.panelCard}>
            <Text style={styles.panelHeading}>Notes</Text>
            <Bullets items={input.narrative.notes} />
          </View>
        </View>

        {/* Footer - prepared-by + page counter, both fixed so they appear
            on every page when the table spills over */}
        <View style={styles.footer} fixed>
          <Text>
            Prepared by:{" "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {input.preparedByName ?? "Command Talent Group"}
            </Text>
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// Dedupe-union helper shared with the on-screen layout. Kept here so
// the PDF can stand alone if a caller imports just this module.
export function mergeBullets(rows: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const b of row) {
      const k = b.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}
