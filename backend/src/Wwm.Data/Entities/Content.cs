namespace Wwm.Data.Entities;

public class Event
{
    public int Id { get; set; }
    public bool? Pin { get; set; }
    public DateOnly? EventDate { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Banner { get; set; }
    public string? P1 { get; set; }
    public string? P2 { get; set; }
    public string? P3 { get; set; }
    public string? P4 { get; set; }
    public string? P5 { get; set; }
    public string? Link { get; set; }
}

public class ScheduleItem
{
    public int Id { get; set; }
    public string? DateTime { get; set; }   // free-text in the sheet (e.g. "Sat 21:00")
    public string? Type { get; set; }
    public string Activity { get; set; } = string.Empty;
}
