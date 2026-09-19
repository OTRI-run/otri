"""Results files as organizers have them, not as OTRI would like them (ingestion/normalize.py).

The shapes below follow the exports in circulation: the ITRA / UTMB results sheet, a RaceResult
list in German, a LiveTrail download in French, a Thai spreadsheet, a plain finisher list with no
ranks. They are written here from their published layouts, not copied from anyone's results.
"""

import datetime as dt

from openpyxl import Workbook

from ingestion import result_records, validate_result_file
from ingestion.normalize import country_code, gender_from_category, split_name
from ingestion.time_utils import canonical_time


def _records(path):
    report = validate_result_file(path)
    assert report.is_valid, [issue.message for issue in report.errors]
    return report, result_records(path)


def test_the_itra_results_sheet_reads_as_it_is(tmp_path):
    path = tmp_path / "itra.csv"
    path.write_text(
        "Ranking,Time,Family name,First name,Gender,Birthdate,Nationality,Bib,City,Team\n"
        "1,05:42:18,MARTIN,Alex,M,12/04/1990,FRA,101,Chamonix,Trail Club\n"
        "2,05:58:40,WONG,Dana,F,1988-11-02,HKG,102,Hong Kong,\n"
        "DNF,,RAY,Cy,M,03.07.1979,GER,103,Berlin,\n",
        encoding="utf-8",
    )
    report, records = _records(path)
    assert report.warnings == ()
    assert [(r.rank, r.finish_time_seconds, r.birth_year, r.nationality) for r in records] == [(1, 20538, 1990, "FRA"), (2, 21520, 1988, "HKG"), ("DNF", None, 1979, "DEU")]


def test_a_utmb_style_export_semicolons_one_runner_column_and_two_letter_countries(tmp_path):
    path = tmp_path / "utmb.csv"
    path.write_text(
        "UTMB World Series - Official results;;;;;;\n"
        "\n"
        "Rank;Bib;Runner;Nationality;Category;Category rank;Time\n"
        "1;4;Jim WALMSLEY;US;M 30-34;1;19:37:43\n"
        "2;12;Courtney DAUWALTER;US;F 35-39;1;23:29:14\n"
        "3;7;François D'HAENE;FR;M 35-39;1;26:03:04\n"
        ";31;Ludovic DE LA TOUR;CH;M 40-44;;Abandon\n",
        encoding="utf-8",
    )
    report, records = _records(path)
    assert report.columns["finish_time"] == "Time" and report.columns["full_name"] == "Runner" and report.columns["rank"] == "Rank"
    assert "Category rank" in report.ignored_columns, "a ranking within a category is never taken for the overall one"
    assert [(r.rank, r.family_name, r.first_name, r.gender, r.nationality) for r in records] == [
        (1, "WALMSLEY", "Jim", "M", "USA"),
        (2, "DAUWALTER", "Courtney", "F", "USA"),
        (3, "D'HAENE", "François", "M", "FRA"),
        ("DNF", "DE LA TOUR", "Ludovic", "M", "CHE"),
    ]
    assert records[2].finish_time_seconds == 26 * 3600 + 3 * 60 + 4
    messages = [w.message for w in report.warnings]
    assert any("names were split from the single column “Runner”" in m for m in messages)
    assert any("gender was read from the category column “Category”" in m for m in messages)


def test_a_raceresult_list_in_german_written_by_excel_on_windows(tmp_path):
    path = tmp_path / "raceresult.csv"
    text = "Platz;Stnr;Name;Jg;AK;Verein;Nat;Zeit\n1.;17;Müller, Jörg;1985;M35;LG Allgäu;GER;2:41:09\n2.;23;Weiß, Änne;1991;W30;;SUI;2:55:30\n"
    path.write_bytes(text.encode("cp1252"))
    report, records = _records(path)
    assert [(r.rank, r.family_name, r.first_name, r.gender, r.birth_year, r.nationality, r.bib_number) for r in records] == [
        (1, "Müller", "Jörg", "M", 1985, "DEU", "17"),
        (2, "Weiß", "Änne", "F", 1991, "CHE", "23"),
    ]


def test_a_livetrail_download_in_french_with_lettered_times(tmp_path):
    path = tmp_path / "livetrail.csv"
    path.write_text(
        "Clt;Dossard;Nom;Prénom;Cat;Club;Pays;Temps\n"
        "1;5;DUPONT;Jean;SEH;AS Trail;France;12h34m56s\n"
        "2;9;MARTIN;Zoé;V1F;;Suisse;13h02'11''\n"
        "3;14;PETIT;Luc;M2H;;Belgique;1j 02:10:00\n",
        encoding="utf-8",
    )
    _report, records = _records(path)
    assert [(r.rank, r.gender, r.nationality, r.finish_time_seconds) for r in records] == [(1, "M", "FRA", 45296), (2, "F", "CHE", 46931), (3, "M", "BEL", 94200)]


def test_a_thai_spreadsheet(tmp_path):
    path = tmp_path / "thai.csv"
    path.write_text("อันดับ,หมายเลข,ชื่อ,นามสกุล,เพศ,สัญชาติ,เวลา\n1,101,สมชาย,ใจดี,ชาย,ไทย,3:10:05\n2,102,สมศรี,ใจดี,หญิง,ประเทศไทย,3:25:40\n", encoding="utf-8-sig")
    _report, records = _records(path)
    assert [(r.rank, r.first_name, r.family_name, r.gender, r.nationality, r.bib_number) for r in records] == [(1, "สมชาย", "ใจดี", "M", "THA", "101"), (2, "สมศรี", "ใจดี", "F", "THA", "102")]


def test_a_plain_finisher_list_with_no_ranks_and_no_gender(tmp_path):
    """Tab separated, sorted by bib: positions come from the times, equal times share one."""
    path = tmp_path / "list.tsv"
    path.write_text("Bib\tName\tFinish time\n7\tAnn Lee\t4:10:00\n3\tBo Ray\t3:59:59\n9\tCy Day\t4:10:00\n11\tDi Fox\t\n", encoding="utf-8")
    report, records = _records(path)
    assert [(r.bib_number, r.rank, r.gender) for r in records] == [("7", 2, "X"), ("3", 1, "X"), ("9", 2, "X"), ("11", "DNF", "X")]
    messages = [w.message for w in report.warnings]
    assert "the file has no rank column: positions were worked out from the finish times" in messages
    assert any("no gender column" in m and "left out of the women's and men's rankings" in m for m in messages)
    assert any("counted as DNF (row 4)" in m for m in messages)


def test_a_rank_column_that_is_a_category_ranking_is_not_believed(tmp_path):
    path = tmp_path / "catrank.csv"
    rows = ["Pos,Time,Last name,First name,Gender"]
    for index in range(6):
        rows.append(f"{index // 2 + 1},{4 + index}:00:00,Runner{index},Test,{'MF'[index % 2]}")
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    report, records = _records(path)
    assert [r.rank for r in records] == [1, 2, 3, 4, 5, 6]
    assert any("repeats positions with different times" in w.message for w in report.warnings)


def test_a_spreadsheet_with_time_cells_a_title_above_the_header_and_numeric_bibs(tmp_path):
    path = tmp_path / "results.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["Doi Example Trail 2027 - 50K results"])
    sheet.append([])
    sheet.append(["Position", "Race number", "First name", "Surname", "Sex", "Chip time", "Gun time"])
    sheet.append([1, 12.0, "Ann", "Lee", "Female", dt.time(5, 1, 2), dt.time(5, 1, 9)])
    sheet.append([2, 40.0, "Bo", "Ray", "Male", dt.timedelta(hours=26, minutes=3, seconds=4), None])
    sheet.append([3, 41.0, "Cy", "Day", "Male", 1.2534722, None])  # a time cell kept as a fraction of a day: 30:05:00
    workbook.save(path)
    report, records = _records(path)
    assert report.columns["finish_time"] == "Chip time" and "Gun time" in report.ignored_columns
    assert [(r.rank, r.bib_number, r.gender, r.finish_time_seconds) for r in records] == [(1, "12", "F", 18062), (2, "40", "M", 93784), (3, "41", "M", 108300)]


def test_a_repeated_problem_is_reported_a_few_times_and_then_counted(tmp_path):
    path = tmp_path / "many.csv"
    path.write_text("Rank,Time,Last name,First name,Gender\n" + "".join(f"{i},4:{i % 60:02d}:00,R{i},T,Q\n" for i in range(1, 41)), encoding="utf-8")
    warnings = [w for w in validate_result_file(path).warnings if w.field == "gender"]
    assert len(warnings) == 16 and warnings[-1].row is None and "25 more rows" in warnings[-1].message


def test_the_helpers_on_their_own():
    assert split_name("WALMSLEY Jim") == split_name("Jim WALMSLEY") == split_name("WALMSLEY, Jim") == ("WALMSLEY", "Jim")
    assert split_name("Ludovic de la Tour") == ("de la Tour", "Ludovic") and split_name("Suharto") == ("Suharto", "")
    assert split_name("Dupont Jean", family_first=True) == ("Dupont", "Jean")
    assert [gender_from_category(c) for c in ["SEH", "V1F", "M40-44", "F 35-39", "W35", "Women 40+", "40-49 M", "Open", "U23"]] == ["M", "F", "M", "F", "F", "F", "M", None, None]
    assert [country_code(c) for c in ["FRA", "fr", "France", "GER", "Schweiz", "(THA)", "UK", "Narnia"]] == ["FRA", "FRA", "FRA", "DEU", "CHE", "THA", "GBR", None]
    assert [canonical_time(t) for t in ["12h34m56s", "12h34", "1d 02:03:04", "PT5H1M2S", "45'12\"", "5:01:02", "soon"]] == ["12:34:56", "12:34:00", "26:03:04", "5:01:02", "0:45:12", "5:01:02", "soon"]
