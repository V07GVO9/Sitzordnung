package de.wasserprotokoll;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Schreibt eine echte Excel-Datei (.xlsx, Office Open XML) ohne Fremdbibliothek.
 * Blatt 1 "Protokoll": alle Einträge. Blatt 2 "Tagesübersicht": Summen je Tag.
 */
public final class XlsxExport {

    private XlsxExport() {
    }

    // Style-Indizes aus styles.xml
    private static final int S_KOPF = 1, S_DATUM = 2, S_UHRZEIT = 3;

    public static void schreiben(List<Eintrag> neuesteZuerst, OutputStream out) throws IOException {
        List<Eintrag> eintraege = new ArrayList<>(neuesteZuerst);
        java.util.Collections.reverse(eintraege); // chronologisch

        ZipOutputStream zip = new ZipOutputStream(out);
        datei(zip, "[Content_Types].xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet2.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>"
                + "</Types>");
        datei(zip, "_rels/.rels",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/>"
                + "</Relationships>");
        datei(zip, "xl/workbook.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" "
                + "xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
                + "<sheets><sheet name=\"Protokoll\" sheetId=\"1\" r:id=\"rId1\"/>"
                + "<sheet name=\"Tagesübersicht\" sheetId=\"2\" r:id=\"rId2\"/></sheets></workbook>");
        datei(zip, "xl/_rels/workbook.xml.rels",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet2.xml\"/>"
                + "<Relationship Id=\"rId3\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>"
                + "</Relationships>");
        datei(zip, "xl/styles.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                + "<numFmts count=\"2\"><numFmt numFmtId=\"164\" formatCode=\"dd.mm.yyyy\"/>"
                + "<numFmt numFmtId=\"165\" formatCode=\"hh:mm\"/></numFmts>"
                + "<fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font>"
                + "<font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>"
                + "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill>"
                + "<fill><patternFill patternType=\"gray125\"/></fill>"
                + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFBBDEFB\"/></patternFill></fill></fills>"
                + "<borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders>"
                + "<cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs>"
                + "<cellXfs count=\"4\">"
                + "<xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/>"
                + "<xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/>"
                + "<xf numFmtId=\"164\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>"
                + "<xf numFmtId=\"165\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyNumberFormat=\"1\"/>"
                + "</cellXfs><cellStyles count=\"1\"><cellStyle name=\"Standard\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>");

        // Blatt 1: Protokoll
        StringBuilder s1 = kopfBlatt(new int[]{14, 10, 14, 14});
        s1.append("<row r=\"1\">")
                .append(text("A1", "Datum", S_KOPF)).append(text("B1", "Uhrzeit", S_KOPF))
                .append(text("C1", "Aktion", S_KOPF)).append(text("D1", "Menge (ml)", S_KOPF))
                .append("</row>");
        int r = 2;
        for (Eintrag e : eintraege) {
            double serial = excelSerial(e.zeit);
            s1.append("<row r=\"").append(r).append("\">")
                    .append(zahl("A" + r, Math.floor(serial), S_DATUM))
                    .append(zahl("B" + r, serial - Math.floor(serial), S_UHRZEIT))
                    .append(text("C" + r, Eintrag.name(e.art), 0));
            if (Eintrag.istGetraenk(e.art)) {
                s1.append(zahl("D" + r, e.mengeMl, 0));
            }
            s1.append("</row>");
            r++;
        }
        s1.append("</sheetData>");
        if (r > 2) {
            s1.append("<autoFilter ref=\"A1:D").append(r - 1).append("\"/>");
        }
        s1.append("</worksheet>");
        datei(zip, "xl/worksheets/sheet1.xml", s1.toString());

        // Blatt 2: Tagesübersicht
        // Datum -> {Serial, Gesamt ml, Wasser ml, Kaffee ml, Softdrink ml, Anzahl Urinieren}
        Map<String, long[]> tage = new LinkedHashMap<>();
        SimpleDateFormat tagFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY);
        for (Eintrag e : eintraege) {
            String tag = tagFmt.format(e.zeit);
            long[] w = tage.get(tag);
            if (w == null) {
                w = new long[]{(long) Math.floor(excelSerial(e.zeit)), 0, 0, 0, 0, 0};
                tage.put(tag, w);
            }
            if (Eintrag.URIN.equals(e.art)) {
                w[5]++;
            } else {
                w[1] += e.mengeMl;
                if (Eintrag.KAFFEE.equals(e.art)) {
                    w[3] += e.mengeMl;
                } else if (Eintrag.SOFTDRINK.equals(e.art)) {
                    w[4] += e.mengeMl;
                } else {
                    w[2] += e.mengeMl;
                }
            }
        }
        String[] kopf = {"Datum", "Gesamt (ml)", "Wasser (ml)", "Kaffee (ml)", "Softdrink (ml)", "Anzahl Urinieren"};
        StringBuilder s2 = kopfBlatt(new int[]{14, 14, 14, 14, 16, 18});
        s2.append("<row r=\"1\">");
        for (int i = 0; i < kopf.length; i++) {
            s2.append(text((char) ('A' + i) + "1", kopf[i], S_KOPF));
        }
        s2.append("</row>");
        r = 2;
        for (long[] w : tage.values()) {
            s2.append("<row r=\"").append(r).append("\">");
            for (int i = 0; i < w.length; i++) {
                s2.append(zahl((char) ('A' + i) + "" + r, w[i], i == 0 ? S_DATUM : 0));
            }
            s2.append("</row>");
            r++;
        }
        s2.append("</sheetData></worksheet>");
        datei(zip, "xl/worksheets/sheet2.xml", s2.toString());

        zip.finish();
        zip.flush();
    }

    /** Excel-Seriennummer (Tage seit 30.12.1899) in lokaler Zeit. */
    private static double excelSerial(long millis) {
        long lokal = millis + TimeZone.getDefault().getOffset(millis);
        return lokal / 86400000.0 + 25569.0;
    }

    private static StringBuilder kopfBlatt(int[] breiten) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                .append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">")
                .append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" ")
                .append("activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><cols>");
        for (int i = 0; i < breiten.length; i++) {
            sb.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1)
                    .append("\" width=\"").append(breiten[i]).append("\" customWidth=\"1\"/>");
        }
        sb.append("</cols><sheetData>");
        return sb;
    }

    private static String text(String ref, String wert, int style) {
        return "<c r=\"" + ref + "\" t=\"inlineStr\"" + (style > 0 ? " s=\"" + style + "\"" : "")
                + "><is><t>" + xml(wert) + "</t></is></c>";
    }

    private static String zahl(String ref, double wert, int style) {
        String w = (wert == Math.rint(wert)) ? String.valueOf((long) wert) : String.valueOf(wert);
        return "<c r=\"" + ref + "\"" + (style > 0 ? " s=\"" + style + "\"" : "") + "><v>" + w + "</v></c>";
    }

    private static String xml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static void datei(ZipOutputStream zip, String name, String inhalt) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(inhalt.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
