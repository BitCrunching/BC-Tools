import AVFoundation
import CoreVideo
import Foundation

let args = CommandLine.arguments
let out = URL(fileURLWithPath: args[1])
let w = Int(args[2])!, h = Int(args[3])!, seconds = Int(args[4])!, mbps = Int(args[5])!
let fps = 30
try? FileManager.default.removeItem(at: out)
let writer = try! AVAssetWriter(outputURL: out, fileType: .mov)
let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: mbps * 1_000_000, AVVideoMaxKeyFrameIntervalKey: 30, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
var rng = SystemRandomNumberGenerator()
let total = seconds * fps
var frame = 0
let q = DispatchQueue(label: "gen")
let sem = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: q) {
  while input.isReadyForMoreMediaData && frame < total {
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    let buf = pb!
    CVPixelBufferLockBaseAddress(buf, [])
    let base = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
    let stride = CVPixelBufferGetBytesPerRow(buf)
    for y in 0..<h {
      let row = base + y * stride
      for x in 0..<w {
        let n = UInt8(truncatingIfNeeded: (x &* 3 &+ y &* 5 &+ frame &* 7) ^ Int(UInt8.random(in: 0...40, using: &rng)))
        row[x*4] = n; row[x*4+1] = UInt8(truncatingIfNeeded: x &+ frame &* 2); row[x*4+2] = UInt8(truncatingIfNeeded: y &+ frame); row[x*4+3] = 255
      }
    }
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: Int64(frame), timescale: Int32(fps)))
    frame += 1
  }
  if frame >= total { input.markAsFinished(); writer.finishWriting { sem.signal() } }
}
sem.wait()
print("done", out.path)
