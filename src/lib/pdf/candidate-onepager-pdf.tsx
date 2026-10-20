import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// Single-candidate submittal one-pager. Compact sibling of
// candidate-review-pdf.tsx - same brand language, one candidate,
// ready to email to a client.

const COLORS = {
  ink: "#0b1320",
  inkSoft: "#4a5567",
  inkMuted: "#7a8597",
  border: "#d0d7e2",
  heading: "#0d3b66",
  accent: "#117a3d",
  accentSoft: "#e7f3ec",
  panelBorder: "#cfe3d0",
  pipFill: "#16a34a",
  pipEmpty: "#dbeadc",
};

export type OnePagerInput = {
  name: string;
  facts: { label: string; value: string }[];
  background: string[];
  strengths: string[];
  areasToValidate: string[];
  interviewFocus: string[];
  roleFits: { jobTitle: string; companyName: string; score: number | null }[];
  preparedByName: string | null;
  generatedAt: Date;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 36,
    paddingHorizontal: 32,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
    lineHeight: 1.4,
  },
  banner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1pt solid ${COLORS.border}`,
    paddingBottom: 6,
    marginBottom: 14,
  },
  bannerBrand: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  bannerMeta: { fontSize: 8, color: COLORS.inkMuted },
  name: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: COLORS.heading,
    marginBottom: 4,
  },
  factsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  fact: { fontSize: 8.5, color: COLORS.inkSoft },
  factLabel: { fontFamily: "Helvetica-Bold" },
  fitCard: {
    backgroundColor: COLORS.accentSoft,
    borderColor: COLORS.panelBorder,
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  fitHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  fitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  fitLabel: { fontSize: 9 },
  pipRow: { flexDirection: "row", gap: 3 },
  pip: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 0.75,
    borderColor: COLORS.pipFill,
  },
  pipOn: { backgroundColor: COLORS.pipFill },
  pipOff: { backgroundColor: COLORS.pipEmpty },
  sectionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  section: { width: "47%", marginBottom: 12 },
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.heading,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `0.75pt solid ${COLORS.border}`,
    paddingBottom: 3,
    marginBottom: 5,
  },
  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 8, fontSize: 9, color: COLORS.inkSoft },
  bulletText: { flex: 1, fontSize: 9 },
  empty: { fontSize: 9, fontStyle: "italic", color: COLORS.inkMuted },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: COLORS.inkMuted,
    paddingTop: 6,
    borderTop: `0.5pt solid ${COLORS.border}`,
  },
});

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <Text style={styles.empty}>-</Text>;
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

function Pips({ score }: { score: number | null }) {
  const filled =
    score == null ? 0 : Math.round(Math.max(0, Math.min(3, score)));
  return (
    <View style={styles.pipRow}>
      {[1, 2, 3].map((n) => (
        <View
          key={n}
          style={[styles.pip, filled >= n ? styles.pipOn : styles.pipOff]}
        />
      ))}
    </View>
  );
}

export function CandidateOnePagerPdf({ input }: { input: OnePagerInput }) {
  const dateLabel = input.generatedAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  return (
    <Document
      title={`${input.name} - Candidate Profile`}
      author="Command Talent Group"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.banner}>
          <Text style={styles.bannerBrand}>
            Command Talent Group · Candidate Profile
          </Text>
          <Text style={styles.bannerMeta}>
            {dateLabel} · Confidential
          </Text>
        </View>

        <Text style={styles.name}>{input.name}</Text>
        <View style={styles.factsRow}>
          {input.facts.map((f, i) => (
            <Text key={i} style={styles.fact}>
              <Text style={styles.factLabel}>{f.label}: </Text>
              {f.value}
            </Text>
          ))}
        </View>

        {input.roleFits.length > 0 ? (
          <View style={styles.fitCard}>
            <Text style={styles.fitHeading}>Role Fit</Text>
            {input.roleFits.map((f, i) => (
              <View key={i} style={styles.fitRow}>
                <Text style={styles.fitLabel}>
                  {f.jobTitle}
                  {f.companyName ? ` - ${f.companyName}` : ""}
                </Text>
                <Pips score={f.score} />
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.sectionGrid}>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Background</Text>
            <Bullets items={input.background} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Strengths</Text>
            <Bullets items={input.strengths} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Areas to Validate</Text>
            <Bullets items={input.areasToValidate} />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Interview Focus</Text>
            <Bullets items={input.interviewFocus} />
          </View>
        </View>

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
