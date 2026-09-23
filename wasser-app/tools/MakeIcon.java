import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Erzeugt das App-Icon (Wassertropfen auf blauem Kreis) als PNG. */
public class MakeIcon {
    public static void main(String[] args) throws Exception {
        int s = 192;
        BufferedImage img = new BufferedImage(s, s, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0x1565C0));
        g.fill(new Ellipse2D.Double(4, 4, s - 8, s - 8));
        Path2D drop = new Path2D.Double();
        drop.moveTo(96, 34);
        drop.curveTo(96, 34, 50, 92, 50, 118);
        drop.curveTo(50, 144, 71, 162, 96, 162);
        drop.curveTo(121, 162, 142, 144, 142, 118);
        drop.curveTo(142, 92, 96, 34, 96, 34);
        drop.closePath();
        g.setColor(Color.WHITE);
        g.fill(drop);
        g.setColor(new Color(0x90CAF9));
        g.setStroke(new BasicStroke(8, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Arc2D.Double(66, 96, 44, 48, 180, 80, Arc2D.OPEN));
        g.dispose();
        ImageIO.write(img, "png", new File(args[0]));
    }
}
