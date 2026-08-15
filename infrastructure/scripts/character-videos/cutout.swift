// One-off asset tool: extract the foreground character from a photo/render
// into a transparent PNG using the macOS Vision framework (fully offline).
// usage: swift cutout.swift <input> <output.png>
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: cutout <input> <output.png>\n".data(using: .utf8)!)
    exit(2)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let image = CIImage(contentsOf: inURL) else {
    FileHandle.standardError.write("cannot read \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: image, options: [:])
try handler.perform([request])
guard let result = request.results?.first, !result.allInstances.isEmpty else {
    FileHandle.standardError.write("no foreground instances found\n".data(using: .utf8)!)
    exit(1)
}
let maskBuffer = try result.generateScaledMaskForImage(
    forInstances: result.allInstances, from: handler)
let mask = CIImage(cvPixelBuffer: maskBuffer)

let blend = CIFilter(name: "CIBlendWithMask")!
blend.setValue(image, forKey: kCIInputImageKey)
blend.setValue(CIImage(color: .clear).cropped(to: image.extent), forKey: kCIInputBackgroundImageKey)
blend.setValue(mask, forKey: kCIInputMaskImageKey)
guard let output = blend.outputImage else {
    FileHandle.standardError.write("blend failed\n".data(using: .utf8)!)
    exit(1)
}

let context = CIContext()
guard let png = context.pngRepresentation(
    of: output, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
else {
    FileHandle.standardError.write("png encode failed\n".data(using: .utf8)!)
    exit(1)
}
try png.write(to: outURL)
print("wrote \(outURL.path)")
