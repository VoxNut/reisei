import unittest

from bs4 import BeautifulSoup

from scripts.remove_dialect_dictionary import remove_dictionary


class RemoveDialectDictionaryTests(unittest.TestCase):
    def test_repairs_split_export_and_removes_detached_definition(self):
        source = '<style>@import url("_extracted_css.css");</style><div class="yomitan-glossary"><ol>'
        source += '<li data-dictionary="A"><span>Keep A</span></li>'
        source += '<li data-dictionary="全国方言辞典">Dialect heading</li>'
        source += '<li>Dialect meaning<ul><li>Dialect example</li></ul></li></ol></div>'
        source += '<li data-dictionary="B"><details><summary>Examples</summary>Keep B</details></li>'
        cleaned, removed = remove_dictionary(source)
        soup = BeautifulSoup(cleaned, "html.parser")
        self.assertEqual(removed, 1)
        self.assertEqual([entry["data-dictionary"] for entry in soup.select("div.yomitan-glossary > ol > li")], ["A", "B"])
        self.assertNotIn("Dialect", soup.get_text())
        self.assertEqual(soup.select_one('[data-dictionary="A"]').get_text(), "Keep A")
        self.assertEqual(soup.select_one('[data-dictionary="B"] details').get_text(), "ExamplesKeep B")
        self.assertIn("_extracted_css.css", str(soup.style))
        self.assertEqual(remove_dictionary(cleaned), (cleaned, 0))

    def test_removes_multiple_regions(self):
        source = '<ol><li data-dictionary="全国方言辞典">Region one</li><li>Extra</li>'
        source += '<li data-dictionary="全国方言辞典">Region two</li><li data-dictionary="A">Keep</li></ol>'
        cleaned, count = remove_dictionary(source)
        self.assertEqual(count, 2)
        self.assertNotIn("Region", cleaned)
        self.assertNotIn("Extra", cleaned)
        self.assertIn("Keep", cleaned)

    def test_preserves_unrelated_plain_content(self):
        source = '<p>A mention of 全国方言辞典, not a dictionary entry</p>'
        self.assertEqual(remove_dictionary(source), (source, 0))

    def test_refuses_to_drop_unassigned_content(self):
        with self.assertRaisesRegex(ValueError, "Unassigned glossary content"):
            remove_dictionary('<p>Keep this separate text</p><li data-dictionary="全国方言辞典">Remove</li>')


if __name__ == "__main__":
    unittest.main()
