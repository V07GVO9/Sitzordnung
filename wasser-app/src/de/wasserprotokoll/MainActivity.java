package de.wasserprotokoll;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
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
import android.widget.DatePicker;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TimePicker;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
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
    private static final int BRAUN = 0xFF6D4C41;
    private static final int ROT = 0xFFD84315;
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

        // Die vier Knöpfe (2 × 2)
        Button wasser = grosserKnopf("💧\nWasser", BLAU, Color.WHITE);
        wasser.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mengeWaehlen();
            }
        });
        Button kaffee = grosserKnopf("☕\nKaffee", BRAUN, Color.WHITE);
        kaffee.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                getraenkSpeichern(Eintrag.KAFFEE, Eintrag.STANDARD_ML);
            }
        });
        Button softdrink = grosserKnopf("🥤\nSoftdrink", ROT, Color.WHITE);
        softdrink.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                getraenkSpeichern(Eintrag.SOFTDRINK, Eintrag.STANDARD_ML);
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
        LinearLayout knoepfe = new LinearLayout(this);
        knoepfe.setOrientation(LinearLayout.VERTICAL);
        knoepfe.setPadding(dp(12), dp(6), dp(12), dp(12));
        knoepfe.addView(knopfReihe(wasser, kaffee));
        knoepfe.addView(knopfReihe(softdrink, urin));
        root.addView(knoepfe);

        // Tabelle
        TextView hinweis = new TextView(this);
        hinweis.setText("Protokoll  ·  Eintrag lange drücken zum Bearbeiten/Löschen");
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
                eintragMenue(eintraege.get(pos));
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
                .setTitle("Wie viel Wasser?")
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
        getraenkSpeichern(Eintrag.TRINKEN, ml);
    }

    private void getraenkSpeichern(String art, int ml) {
        db.hinzufuegen(art, ml);
        bestaetigen(ml + " ml " + Eintrag.name(art) + " erfasst");
    }

    private void bestaetigen(String text) {
        aktualisieren();
        Toast.makeText(this, text + " (" + zeitFmt.format(new Date()) + " Uhr)", Toast.LENGTH_SHORT).show();
    }

    private String beschreibung(Eintrag e) {
        return datumFmt.format(e.zeit) + ", " + zeitFmt.format(e.zeit) + " Uhr – " + Eintrag.name(e.art)
                + (Eintrag.istGetraenk(e.art) ? " (" + e.mengeMl + " ml)" : "");
    }

    private void eintragMenue(final Eintrag e) {
        new AlertDialog.Builder(this)
                .setTitle(beschreibung(e))
                .setItems(new String[]{"✏️  Bearbeiten", "🗑  Löschen"}, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which == 0) {
                            bearbeiten(e);
                        } else {
                            loeschenFragen(e);
                        }
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    /** Dialog zum Ändern von Datum, Uhrzeit, Aktion und Menge. */
    private void bearbeiten(final Eintrag e) {
        final Calendar zeit = Calendar.getInstance();
        zeit.setTimeInMillis(e.zeit);

        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), 0);

        LinearLayout zeitZeile = new LinearLayout(this);
        zeitZeile.setOrientation(LinearLayout.HORIZONTAL);
        final Button datumKnopf = new Button(this);
        final Button uhrKnopf = new Button(this);
        datumKnopf.setAllCaps(false);
        uhrKnopf.setAllCaps(false);
        datumKnopf.setText("📅 " + datumFmt.format(zeit.getTime()));
        uhrKnopf.setText("🕒 " + zeitFmt.format(zeit.getTime()));
        datumKnopf.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                new DatePickerDialog(MainActivity.this, new DatePickerDialog.OnDateSetListener() {
                    @Override
                    public void onDateSet(DatePicker p, int jahr, int monat, int tag) {
                        zeit.set(jahr, monat, tag);
                        datumKnopf.setText("📅 " + datumFmt.format(zeit.getTime()));
                    }
                }, zeit.get(Calendar.YEAR), zeit.get(Calendar.MONTH), zeit.get(Calendar.DAY_OF_MONTH)).show();
            }
        });
        uhrKnopf.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                new TimePickerDialog(MainActivity.this, new TimePickerDialog.OnTimeSetListener() {
                    @Override
                    public void onTimeSet(TimePicker p, int stunde, int minute) {
                        zeit.set(Calendar.HOUR_OF_DAY, stunde);
                        zeit.set(Calendar.MINUTE, minute);
                        uhrKnopf.setText("🕒 " + zeitFmt.format(zeit.getTime()));
                    }
                }, zeit.get(Calendar.HOUR_OF_DAY), zeit.get(Calendar.MINUTE), true).show();
            }
        });
        zeitZeile.addView(datumKnopf, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        zeitZeile.addView(uhrKnopf, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        form.addView(zeitZeile);

        final String[] arten = {Eintrag.TRINKEN, Eintrag.KAFFEE, Eintrag.SOFTDRINK, Eintrag.URIN};
        final RadioButton[] rb = new RadioButton[arten.length];
        final RadioGroup artWahl = new RadioGroup(this);
        artWahl.setOrientation(RadioGroup.VERTICAL);
        for (int i = 0; i < arten.length; i++) {
            rb[i] = new RadioButton(this);
            rb[i].setText(Eintrag.symbol(arten[i]) + " " + Eintrag.name(arten[i]));
            rb[i].setId(View.generateViewId());
            artWahl.addView(rb[i]);
        }
        form.addView(artWahl);

        final EditText menge = new EditText(this);
        menge.setInputType(InputType.TYPE_CLASS_NUMBER);
        menge.setHint("Menge in ml");
        if (e.mengeMl > 0) {
            menge.setText(String.valueOf(e.mengeMl));
        }
        form.addView(menge);

        artWahl.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(RadioGroup g, int id) {
                boolean urin = id == rb[3].getId();
                menge.setVisibility(urin ? View.GONE : View.VISIBLE);
                boolean fest = id == rb[1].getId() || id == rb[2].getId();
                if (fest && menge.getText().toString().trim().isEmpty()) {
                    menge.setText(String.valueOf(Eintrag.STANDARD_ML));
                }
            }
        });
        for (int i = 0; i < arten.length; i++) {
            if (arten[i].equals(e.art)) {
                artWahl.check(rb[i].getId());
            }
        }

        final AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Eintrag bearbeiten")
                .setView(form)
                .setPositiveButton("Speichern", null)
                .setNegativeButton("Abbrechen", null)
                .create();
        dialog.show();
        // Eigener Klick-Handler, damit der Dialog bei ungültiger Menge offen bleibt
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String art = Eintrag.URIN;
                for (int i = 0; i < arten.length; i++) {
                    if (rb[i].isChecked()) {
                        art = arten[i];
                    }
                }
                int ml = 0;
                if (Eintrag.istGetraenk(art)) {
                    try {
                        ml = Integer.parseInt(menge.getText().toString().trim());
                    } catch (NumberFormatException ignored) {
                    }
                    if (ml <= 0 || ml > 5000) {
                        menge.setError("Bitte 1 bis 5000 ml eingeben");
                        return;
                    }
                }
                db.aendern(e.id, zeit.getTimeInMillis(), art, ml);
                dialog.dismiss();
                aktualisieren();
                Toast.makeText(MainActivity.this, "Eintrag geändert", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void loeschenFragen(final Eintrag e) {
        new AlertDialog.Builder(this)
                .setTitle("Eintrag löschen?")
                .setMessage(beschreibung(e))
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
            if (Eintrag.istGetraenk(e.art)) {
                ml += e.mengeMl;
                trinken++;
            } else {
                urin++;
            }
        }
        heuteText.setText("Heute: " + String.format(Locale.GERMANY, "%,d", ml) + " ml getrunken ("
                + trinken + (trinken == 1 ? " Getränk" : " Getränke") + ")  ·  " + urin + "× uriniert");
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
                    Eintrag.symbol(e.art) + " " + Eintrag.name(e.art),
                    Eintrag.istGetraenk(e.art) ? String.valueOf(e.mengeMl) : ""
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
        b.setTextSize(21);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(schrift);
        b.setBackground(rund(hintergrund, 18));
        b.setElevation(dp(3));
        return b;
    }

    private LinearLayout knopfReihe(Button links, Button rechts) {
        LinearLayout reihe = new LinearLayout(this);
        reihe.setOrientation(LinearLayout.HORIZONTAL);
        reihe.setPadding(0, dp(4), 0, dp(4));
        LinearLayout.LayoutParams lpL = new LinearLayout.LayoutParams(0, dp(105), 1f);
        lpL.setMargins(0, 0, dp(5), 0);
        LinearLayout.LayoutParams lpR = new LinearLayout.LayoutParams(0, dp(105), 1f);
        lpR.setMargins(dp(5), 0, 0, 0);
        reihe.addView(links, lpL);
        reihe.addView(rechts, lpR);
        return reihe;
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
