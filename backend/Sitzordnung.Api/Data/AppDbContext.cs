using Microsoft.EntityFrameworkCore;
using Sitzordnung.Api.Models;

namespace Sitzordnung.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<SchoolClass> SchoolClasses => Set<SchoolClass>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<SeatingPlan> SeatingPlans => Set<SeatingPlan>();
    public DbSet<Seat> Seats => Set<Seat>();
    public DbSet<TimetableEntry> TimetableEntries => Set<TimetableEntry>();
    public DbSet<Rating> Ratings => Set<Rating>();
    public DbSet<GradeScale> GradeScales => Set<GradeScale>();
    public DbSet<GradeScaleEntry> GradeScaleEntries => Set<GradeScaleEntry>();
    public DbSet<AppUser> Users => Set<AppUser>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>()
            .HasIndex(u => u.Username)
            .IsUnique();

        modelBuilder.Entity<SchoolClass>()
            .HasIndex(c => c.Name)
            .IsUnique();

        modelBuilder.Entity<Subject>()
            .HasIndex(s => s.Name)
            .IsUnique();

        // Ein Kurs ist die eindeutige Kombination aus Klasse und Fach.
        modelBuilder.Entity<Course>()
            .HasIndex(c => new { c.SchoolClassId, c.SubjectId })
            .IsUnique();

        modelBuilder.Entity<Course>()
            .HasOne(c => c.SchoolClass)
            .WithMany(sc => sc.Courses)
            .HasForeignKey(c => c.SchoolClassId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Course>()
            .HasOne(c => c.Subject)
            .WithMany(s => s.Courses)
            .HasForeignKey(c => c.SubjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Student>()
            .HasOne(s => s.SchoolClass)
            .WithMany(c => c.Students)
            .HasForeignKey(s => s.SchoolClassId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SeatingPlan>()
            .HasOne(p => p.Course)
            .WithMany(c => c.SeatingPlans)
            .HasForeignKey(p => p.CourseId)
            .OnDelete(DeleteBehavior.Cascade);

        // Ein Platz im Raster kann nur einmal vergeben werden.
        modelBuilder.Entity<Seat>()
            .HasIndex(s => new { s.SeatingPlanId, s.Row, s.Column })
            .IsUnique();

        // Ein Schüler sitzt innerhalb einer Sitzordnung nur an einem Platz.
        modelBuilder.Entity<Seat>()
            .HasIndex(s => new { s.SeatingPlanId, s.StudentId })
            .IsUnique();

        modelBuilder.Entity<Seat>()
            .HasOne(s => s.SeatingPlan)
            .WithMany(p => p.Seats)
            .HasForeignKey(s => s.SeatingPlanId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Seat>()
            .HasOne(s => s.Student)
            .WithMany(st => st.Seats)
            .HasForeignKey(s => s.StudentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<TimetableEntry>()
            .HasOne(t => t.Course)
            .WithMany(c => c.TimetableEntries)
            .HasForeignKey(t => t.CourseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Rating>()
            .HasOne(r => r.Course)
            .WithMany(c => c.Ratings)
            .HasForeignKey(r => r.CourseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Rating>()
            .HasOne(r => r.Student)
            .WithMany(s => s.Ratings)
            .HasForeignKey(r => r.StudentId)
            .OnDelete(DeleteBehavior.Cascade);

        // Je Unterrichtsstunde und Schüler gibt es höchstens eine Bewertung.
        modelBuilder.Entity<Rating>()
            .HasIndex(r => new { r.CourseId, r.StudentId, r.LessonDate, r.LessonStart })
            .IsUnique();

        // Pro Kurs höchstens ein eigener Notenschlüssel, dazu ein globaler
        // Schlüssel mit CourseId = null.
        modelBuilder.Entity<GradeScale>()
            .HasIndex(g => g.CourseId)
            .IsUnique();

        modelBuilder.Entity<GradeScale>()
            .HasOne(g => g.Course)
            .WithMany()
            .HasForeignKey(g => g.CourseId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GradeScaleEntry>()
            .HasOne(e => e.GradeScale)
            .WithMany(g => g.Entries)
            .HasForeignKey(e => e.GradeScaleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
