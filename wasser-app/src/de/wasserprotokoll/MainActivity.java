package de.wasserprotokoll;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_EXPORT = 1;
    private static final int[] MENGEN = {150, 200, 250, 330, 500, 750, 1000};
    private static final float[] SPALTEN = {3f, 2f, 3f, 2f}; // Datum, Uhrzeit, Aktion, Menge

    private static final int BLAU = 0xFF1565C0;
    private static final int BLAU_HELL = 0xFFBBDEFB;
    private static final int GELB = 0xFFF9A825;
    private static final int GRAU_LINIE = 0xFFBDBDBD;
    private static final int ZEILE_GERADE = 0xFFFFFFFF;
    private static final int ZEILE_UNGERADE = 0xFFF1F6FC;

    private final SimpleDateFormat datumFmt = new SimpleDateFormat("dd.MM.yyyy", Locale.GERMANY);
    private final SimpleDateFormat zeitFmt = new SimpleDateFormat("HH:mm", Locale.GERMANY);
    private final SimpleDateFormat dateiFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY);

    private Datenbank db;
    private List<Eintrag> eintraege = new ArrayList<>();
    private TextView heuteText;
    private TabellenAdapter adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new Datenbank(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        // Kopfzeile mit Titel und Export
        LinearLayout kopf = new LinearLayout(this);
        kopf.setOrientation(LinearLayout.HORIZONTAL);
        kopf.setGravity(Gravity.CENTER_VERTICAL);
        kopf.setBackgroundColor(BLAU);
        kopf.setPadding(dp(16), dp(10), dp(8), dp(10));
        TextView titel = new TextView(this);
        titel.setText("Wasserprotokoll");
        titel.setTextColor(Color.WHITE);
        titel.setTextSize(20);
        titel.setTypeface(Typeface.DEFAULT_BOLD);
        kopf.addView(titel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button export = new Button(this);
        export.setText("Excel-Export");
        export.setAllCaps(false);
        export.setTextColor(BLAU);
        export.setBackground(rund(Color.WHITE, 20));
        export.setPadding(dp(14), 0, dp(14), 0);
        export.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                exportStarten();
            }
        });
        kopf.addView(export, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
        root.addView(kopf);

        // Tagesstand
        heuteText = new TextView(this);
        heuteText.setTextSize(16);
        heuteText.setTextColor(0xFF263238);
        heuteText.setGravity(Gravity.CENTER);
        heuteText.setPadding(dp(16), dp(14), dp(16), dp(6));
        root.addView(heuteText);

        // Die zwei Knöpfe
        LinearLayout knoepfe = new LinearLayout(this);
        knoepfe.setOrientation(LinearLayout.HORIZONTAL);
        knoepfe.setPadding(dp(12), dp(6), dp(12), dp(12));
        Button trinken = grosserKnopf("💧\nTrinken", BLAU, Color.WHITE);
        trinken.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mengeWaehlen();
            }
        });
        Button urin = grosserKnopf("🚽\nUrinieren", GELB, 0xFF212121);
        urin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                db.hinzufuegen(Eintrag.URIN, 0);
                bestaetigen("Urinieren erfasst");
            }
        });
        LinearLayout.LayoutParams lpL = new LinearLayout.LayoutParams(0, dp(150), 1f);
        lpL.setMargins(0, 0, dp(6), 0);
        LinearLayout.LayoutParams lpR = new LinearLayout.LayoutParams(0, dp(150), 1f);
        lpR.setMargins(dp(6), 0, 0, 0);
        knoepfe.addView(trinken, lpL);
        knoepfe.addView(urin, lpR);
        root.addView(knoepfe);

        // Tabelle
        TextView hinweis = new TextView(this);
        hinweis.setText("Protokoll  ·  Eintrag lange drücken zum Löschen");
        hinweis.setTextSize(13);
        hinweis.setTextColor(0xFF607D8B);
        hinweis.setPadding(dp(14), 0, dp(14), dp(4));
        root.addView(hinweis);

        LinearLayout tabelle = new LinearLayout(this);
        tabelle.setOrientation(LinearLayout.VERTICAL);
        tabelle.setBackgroundColor(GRAU_LINIE);
        tabelle.setPadding(1, 1, 0, 0);
        tabelle.addView(zeile(new String[]{"Datum", "Uhrzeit", "Aktion", "Menge (ml)"}, BLAU_HELL, true));
        ListView liste = new ListView(this);
        liste.setDivider(null);
        adapter = new TabellenAdapter();
        liste.setAdapter(adapter);
        liste.setEmptyView(null);
        liste.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> parent, View view, int pos, long id) {
                loeschenFragen(eintraege.get(pos));
                return true;
            }
        });
        tabelle.addView(liste, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout.LayoutParams lpT = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        lpT.setMargins(dp(8), 0, dp(8), dp(8));
        root.addView(tabelle, lpT);

        setContentView(root);
        aktualisieren();
    }

    @Override
    protected void onResume() {
        super.onResume();
        aktualisieren(); // z. B. nach Mitternacht den Tagesstand neu berechnen
    }

    // ---------- Aktionen ----------

    private void mengeWaehlen() {
        String[] texte = new String[MENGEN.length + 1];
        for (int i = 0; i < MENGEN.length; i++) {
            texte[i] = MENGEN[i] + " ml";
        }
        texte[MENGEN.length] = "Andere Menge …";
        new AlertDialog.Builder(this)
                .setTitle("Wie viel getrunken?")
                .setItems(texte, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which < MENGEN.length) {
                            trinkenSpeichern(MENGEN[which]);
                        } else {
                            eigeneMenge();
                        }
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void eigeneMenge() {
        final EditText eingabe = new EditText(this);
        eingabe.setInputType(InputType.TYPE_CLASS_NUMBER);
        eingabe.setHint("Menge in ml");
        LinearLayout rahmen = new LinearLayout(this);
        rahmen.setPadding(dp(20), dp(8), dp(20), 0);
        rahmen.addView(eingabe, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        new AlertDialog.Builder(this)
                .setTitle("Menge eingeben")
                .setView(rahmen)
                .setPositiveButton("Speichern", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        try {
                            int ml = Integer.parseInt(eingabe.getText().toString().trim());
                            if (ml > 0 && ml <= 5000) {
                                trinkenSpeichern(ml);
                                return;
                            }
                        } catch (NumberFormatException ignored) {
                        }
                        Toast.makeText(MainActivity.this, "Bitte 1 bis 5000 ml eingeben", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void trinkenSpeichern(int ml) {
        db.hinzufuegen(Eintrag.TRINKEN, ml);
        bestaetigen(ml + " ml Trinken erfasst");
    }

    private void bestaetigen(String text) {
        aktualisieren();
        Toast.makeText(this, text + " (" + zeitFmt.format(new Date()) + " Uhr)", Toast.LENGTH_SHORT).show();
    }

    private void loeschenFragen(final Eintrag e) {
        String beschreibung = datumFmt.format(e.zeit) + ", " + zeitFmt.format(e.zeit) + " Uhr – " + e.art
                + (Eintrag.TRINKEN.equals(e.art) ? " (" + e.mengeMl + " ml)" : "");
        new AlertDialog.Builder(this)
                .setTitle("Eintrag löschen?")
                .setMessage(beschreibung)
                .setPositiveButton("Löschen", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        db.loeschen(e.id);
                        aktualisieren();
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    private void exportStarten() {
        if (eintraege.isEmpty()) {
            Toast.makeText(this, "Noch keine Einträge vorhanden", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        i.putExtra(Intent.EXTRA_TITLE, "Wasserprotokoll_" + dateiFmt.format(new Date()) + ".xlsx");
        startActivityForResult(i, REQ_EXPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_EXPORT || resultCode != RESULT_OK || data == null || data.getData() == null) {
            return;
        }
        Uri ziel = data.getData();
        try {
            OutputStream out = getContentResolver().openOutputStream(ziel, "w");
            try {
                XlsxExport.schreiben(db.alle(), out);
            } finally {
                out.close();
            }
            Toast.makeText(this, "Excel-Datei gespeichert", Toast.LENGTH_LONG).show();
        } catch (Exception ex) {
            Toast.makeText(this, "Export fehlgeschlagen: " + ex.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ---------- Anzeige ----------

    private void aktualisieren() {
        eintraege = db.alle();
        String heute = datumFmt.format(new Date());
        int ml = 0, trinken = 0, urin = 0;
        for (Eintrag e : eintraege) {
            if (!heute.equals(datumFmt.format(e.zeit))) {
                break; // Liste ist absteigend sortiert
            }
            if (Eintrag.TRINKEN.equals(e.art)) {
                ml += e.mengeMl;
                trinken++;
            } else {
                urin++;
            }
        }
        heuteText.setText("Heute: " + String.format(Locale.GERMANY, "%,d", ml) + " ml getrunken ("
                + trinken + "×)  ·  " + urin + "× uriniert");
        adapter.notifyDataSetChanged();
    }

    private class TabellenAdapter extends BaseAdapter {
        @Override
        public int getCount() {
            return eintraege.size();
        }

        @Override
        public Object getItem(int pos) {
            return eintraege.get(pos);
        }

        @Override
        public long getItemId(int pos) {
            return eintraege.get(pos).id;
        }

        @Override
        public View getView(int pos, View alt, ViewGroup parent) {
            Eintrag e = eintraege.get(pos);
            String[] werte = {
                    datumFmt.format(e.zeit),
                    zeitFmt.format(e.zeit),
                    Eintrag.TRINKEN.equals(e.art) ? "💧 Trinken" : "🚽 Urinieren",
                    Eintrag.TRINKEN.equals(e.art) ? String.valueOf(e.mengeMl) : ""
            };
            int farbe = pos % 2 == 0 ? ZEILE_GERADE : ZEILE_UNGERADE;
            LinearLayout z = (LinearLayout) alt;
            if (z == null) {
                return zeile(werte, farbe, false);
            }
            for (int i = 0; i < werte.length; i++) {
                TextView t = (TextView) z.getChildAt(i);
                t.setText(werte[i]);
                t.setBackgroundColor(farbe);
            }
            return z;
        }
    }

    // ---------- Hilfen ----------

    private LinearLayout zeile(String[] werte, int farbe, boolean kopf) {
        LinearLayout z = new LinearLayout(this);
        z.setOrientation(LinearLayout.HORIZONTAL);
        z.setBackgroundColor(GRAU_LINIE);
        for (int i = 0; i < werte.length; i++) {
            TextView t = new TextView(this);
            t.setText(werte[i]);
            t.setTextSize(kopf ? 14 : 15);
            t.setTextColor(0xFF212121);
            t.setBackgroundColor(farbe);
            t.setPadding(dp(6), dp(8), dp(6), dp(8));
            t.setSingleLine(true);
            if (kopf) {
                t.setTypeface(Typeface.DEFAULT_BOLD);
            }
            t.setGravity(i == 3 ? Gravity.END | Gravity.CENTER_VERTICAL : Gravity.START | Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, SPALTEN[i]);
            lp.setMargins(0, 0, 1, 1); // 1 px Gitterlinie rechts und unten
            z.addView(t, lp);
        }
        return z;
    }

    private Button grosserKnopf(String text, int hintergrund, int schrift) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(24);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(schrift);
        b.setBackground(rund(hintergrund, 18));
        b.setElevation(dp(3));
        return b;
    }

    private GradientDrawable rund(int farbe, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(farbe);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private int dp(int wert) {
        return Math.round(wert * getResources().getDisplayMetrics().density);
    }
}
