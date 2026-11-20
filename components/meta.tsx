import {
  Coins,
  FlaskConical,
  GitBranch,
  Globe2,
  HandHeart,
  HeartPulse,
  Images,
  Info,
  ListTree,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { SectionId } from "@/lib/types";

export const SECTIONS: { id: SectionId; label: string; sub: string; Icon: LucideIcon; color: string }[] = [
  { id: "overview", label: "Overview", sub: "Names, family & summary", Icon: Info, color: "linear-gradient(135deg,#0d7a4f,#10b981)" },
  { id: "photos", label: "Photos", sub: "Whole plant, leaf, flower, fruit, bark", Icon: Images, color: "linear-gradient(135deg,#047857,#34d399)" },
  { id: "taxonomy", label: "Taxonomy", sub: "Kingdom → species", Icon: ListTree, color: "linear-gradient(135deg,#0f766e,#14b8a6)" },
  { id: "systematics", label: "Systematics", sub: "Phylogenetic lineage", Icon: GitBranch, color: "linear-gradient(135deg,#1d4ed8,#3b82f6)" },
  { id: "distribution", label: "Distribution", sub: "Where it grows", Icon: Globe2, color: "linear-gradient(135deg,#0369a1,#0ea5e9)" },
  { id: "conservation", label: "Conservation", sub: "IUCN & native status", Icon: ShieldCheck, color: "linear-gradient(135deg,#b45309,#f59e0b)" },
  { id: "phytochemicals", label: "Phytochemicals", sub: "Compounds & concentrations", Icon: FlaskConical, color: "linear-gradient(135deg,#7c3aed,#a78bfa)" },
  { id: "medicinal", label: "Medicinal uses", sub: "Traditional uses, evidence & safety", Icon: HeartPulse, color: "linear-gradient(135deg,#be123c,#f43f5e)" },
  { id: "ethnobotanical", label: "Ethnobotanical uses", sub: "Traditional knowledge", Icon: HandHeart, color: "linear-gradient(135deg,#a16207,#eab308)" },
  { id: "economic", label: "Economic uses", sub: "Food, timber, fibre & more", Icon: Coins, color: "linear-gradient(135deg,#4d7c0f,#84cc16)" },
];

export const COUNTRIES =
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(
    " ",
  );
