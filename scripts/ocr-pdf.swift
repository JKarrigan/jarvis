// Prints a JSON array with the recognised text of every page of a PDF, using macOS's
// built-in Vision text recognition (handles Japanese, including vertical writing).
// For books whose text is drawn as shapes or images, where there is no text layer to read.
//
//   swift scripts/ocr-pdf.swift BOOK.pdf [lang]      (lang defaults to ja)
import Foundation
import PDFKit
import Vision

let args = CommandLine.arguments
guard args.count >= 2, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: swift ocr-pdf.swift BOOK.pdf [lang]\n".data(using: .utf8)!)
    exit(1)
}
let lang = args.count >= 3 ? args[2] : "ja"
var pages: [String] = []
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { pages.append(""); continue }
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2200 / max(bounds.width, bounds.height)
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
    let image = page.thumbnail(of: size, for: .mediaBox)
    guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { pages.append(""); continue }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = [lang, "en-US"]
    request.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    pages.append(lines.joined(separator: " "))
}
let data = try JSONSerialization.data(withJSONObject: pages, options: [])
FileHandle.standardOutput.write(data)
