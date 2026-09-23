package de.wasserprotokoll;

/** Ein Protokolleintrag: Trinken (mit Menge) oder Toilettengang. */
public class Eintrag {
    public static final String TRINKEN = "Trinken";
    public static final String URIN = "Urinieren";

    public final long id;
    public final long zeit;   // Millisekunden seit 1970
    public final String art;  // TRINKEN oder URIN
    public final int mengeMl; // nur bei TRINKEN, sonst 0

    public Eintrag(long id, long zeit, String art, int mengeMl) {
        this.id = id;
        this.zeit = zeit;
        this.art = art;
        this.mengeMl = mengeMl;
    }
}
