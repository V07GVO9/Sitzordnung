package de.wasserprotokoll;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

/** Speichert die Einträge lokal in SQLite. */
public class Datenbank extends SQLiteOpenHelper {

    public Datenbank(Context context) {
        super(context, "protokoll.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE eintrag (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                + "zeit INTEGER NOT NULL, art TEXT NOT NULL, menge INTEGER NOT NULL DEFAULT 0)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int alt, int neu) {
    }

    public void hinzufuegen(String art, int mengeMl) {
        ContentValues v = new ContentValues();
        v.put("zeit", System.currentTimeMillis());
        v.put("art", art);
        v.put("menge", mengeMl);
        getWritableDatabase().insert("eintrag", null, v);
    }

    public void loeschen(long id) {
        getWritableDatabase().delete("eintrag", "id = ?", new String[]{String.valueOf(id)});
    }

    /** Alle Einträge, neueste zuerst. */
    public List<Eintrag> alle() {
        List<Eintrag> liste = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id, zeit, art, menge FROM eintrag ORDER BY zeit DESC", null);
        try {
            while (c.moveToNext()) {
                liste.add(new Eintrag(c.getLong(0), c.getLong(1), c.getString(2), c.getInt(3)));
            }
        } finally {
            c.close();
        }
        return liste;
    }
}
