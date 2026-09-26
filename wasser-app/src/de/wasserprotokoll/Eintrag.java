package de.wasserprotokoll;

/** Ein Protokolleintrag: Trinken (mit Menge) oder Toilettengang. */
public class Eintrag {
    public static final String TRINKEN = "Trinken";
    public static final String KAFFEE = "Kaffee";
    public static final String SOFTDRINK = "Softdrink";
    public static final String ENERGY = "Energy Drink";
    public static final String URIN = "Urinieren";

    /** Feste Menge für Energy Drinks (Standarddose). */
    public static final int ENERGY_ML = 250;

    /** Feste Menge für Kaffee und Softdrink. */
    public static final int STANDARD_ML = 300;

    public final long id;
    public final long zeit;   // Millisekunden seit 1970
    public final String art;  // TRINKEN (Wasser), KAFFEE, SOFTDRINK, ENERGY oder URIN
    public final int mengeMl; // nur bei Getränken, sonst 0

    public Eintrag(long id, long zeit, String art, int mengeMl) {
        this.id = id;
        this.zeit = zeit;
        this.art = art;
        this.mengeMl = mengeMl;
    }

    public static boolean istGetraenk(String art) {
        return !URIN.equals(art);
    }

    /** Anzeigename; "Trinken" ist intern gespeichert und steht für Wasser. */
    public static String name(String art) {
        return TRINKEN.equals(art) ? "Wasser" : art;
    }

    public static String symbol(String art) {
        if (TRINKEN.equals(art)) return "💧";
        if (KAFFEE.equals(art)) return "☕";
        if (SOFTDRINK.equals(art)) return "🥤";
        if (ENERGY.equals(art)) return "⚡";
        return "🚽";
    }
}
