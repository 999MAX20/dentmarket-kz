#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc != 3) {
            fprintf(stderr, "Usage: ocr-catalog-pages INPUT_DIR OUTPUT_JSON\n");
            return 2;
        }
        NSString *inputDirectory = [NSString stringWithUTF8String:argv[1]];
        NSString *outputPath = [NSString stringWithUTF8String:argv[2]];
        NSFileManager *fm = [NSFileManager defaultManager];
        NSError *error = nil;
        NSArray<NSString *> *names = [[fm contentsOfDirectoryAtPath:inputDirectory error:&error] sortedArrayUsingSelector:@selector(localizedStandardCompare:)];
        if (!names) { fprintf(stderr, "%s\n", error.localizedDescription.UTF8String); return 1; }
        NSMutableArray *pages = [NSMutableArray array];
        for (NSString *name in names) {
            NSString *extension = name.pathExtension.lowercaseString;
            if (![@[@"jpg", @"jpeg", @"png"] containsObject:extension]) continue;
            NSString *filePath = [inputDirectory stringByAppendingPathComponent:name];
            NSURL *url = [NSURL fileURLWithPath:filePath];
            CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
            if (!source) continue;
            CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
            CFRelease(source);
            if (!image) continue;
            VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
            request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            request.usesLanguageCorrection = YES;
            request.recognitionLanguages = @[@"en-US", @"pl-PL"];
            VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
            BOOL ok = [handler performRequests:@[request] error:&error];
            CGImageRelease(image);
            if (!ok) { fprintf(stderr, "OCR %s failed: %s\n", name.UTF8String, error.localizedDescription.UTF8String); continue; }
            NSArray<VNRecognizedTextObservation *> *observations = [request.results sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *a, VNRecognizedTextObservation *b) {
                CGFloat rowDifference = fabs(CGRectGetMidY(a.boundingBox) - CGRectGetMidY(b.boundingBox));
                if (rowDifference < 0.012) return CGRectGetMinX(a.boundingBox) < CGRectGetMinX(b.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
                return CGRectGetMidY(a.boundingBox) > CGRectGetMidY(b.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
            }];
            NSMutableArray *lines = [NSMutableArray array];
            for (VNRecognizedTextObservation *observation in observations) {
                VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
                if (!candidate) continue;
                CGRect box = observation.boundingBox;
                [lines addObject:@{ @"text": candidate.string, @"x": @(box.origin.x), @"y": @(box.origin.y), @"width": @(box.size.width), @"height": @(box.size.height) }];
            }
            [pages addObject:@{ @"file": name, @"lines": lines }];
            fprintf(stderr, "OCR %s: %lu lines\n", name.UTF8String, (unsigned long)lines.count);
        }
        NSData *data = [NSJSONSerialization dataWithJSONObject:pages options:NSJSONWritingPrettyPrinted error:&error];
        if (!data || ![data writeToFile:outputPath options:NSDataWritingAtomic error:&error]) {
            fprintf(stderr, "%s\n", error.localizedDescription.UTF8String); return 1;
        }
    }
    return 0;
}
