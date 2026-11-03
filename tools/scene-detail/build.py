#!/usr/bin/env python3
"""Build the high-resolution room plate and the zoom-in detail layer for one scene.

The full plate (`assets/scenes/<room>.jpg`) covers the whole outpainted room. The
detail layer (`assets/scenes/detail/<room>.webp`) covers exactly the centre half of
that plate ([0.25, 0.75] on both axes) at twice its density, with an alpha mask.

The separately upscaled middle image is registered against the full image (SIFT +
ECC), warped into that exact frame and colour-matched to the full image's low
frequencies. The middle image is then baked back into the full plate under the same
mask, so the two layers carry the same picture and fading between them only changes
sharpness. The mask's outer edge sits inside the area where both upscales agree,
so nothing appears or vanishes when the app cross-fades between them.

Usage:
  python build.py --room attic --full FULL.webp --mid MID.webp --out assets/scenes
  python build.py --room bedroom --full FULL.webp --out assets/scenes \
      --export-center ~/Desktop/saturday-tube-scenes/upscaled-duals
Needs numpy, scipy, pillow and opencv-python-headless.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

FULL_SIZE = (6144, 4096)
DETAIL_SIZE = (6144, 4096)  # the centre half of the full plate at 2x density
AGREE_LOW, AGREE_HIGH = 10.0, 26.0  # mean RGB difference of low-passed images


def load(path, size):
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f'cannot read {path}')
    if (image.shape[1], image.shape[0]) != size:
        image = cv2.resize(image, size, interpolation=cv2.INTER_LANCZOS4 if image.shape[1] < size[0] else cv2.INTER_AREA)
    return image


def detail_to_full_matrix(full_w, full_h, detail_w, detail_h):
    """Affine map from detail-frame pixel indices to full-plate pixel indices."""
    sx = full_w * 0.5 / detail_w
    sy = full_h * 0.5 / detail_h
    return np.array([[sx, 0, full_w * 0.25 + 0.5 * sx - 0.5], [0, sy, full_h * 0.25 + 0.5 * sy - 0.5], [0, 0, 1]], np.float64)


def register(full, mid):
    """Similarity transform mapping mid pixels to full pixels (3x3)."""
    fw, mw = 2048, 1024
    fs = fw / full.shape[1]
    ms = mw / mid.shape[1]
    small_full = cv2.resize(full, (fw, round(full.shape[0] * fs)), interpolation=cv2.INTER_AREA)
    small_mid = cv2.resize(mid, (mw, round(mid.shape[0] * ms)), interpolation=cv2.INTER_AREA)
    sift = cv2.SIFT_create(10000)
    kf, df = sift.detectAndCompute(cv2.cvtColor(small_full, cv2.COLOR_BGR2GRAY), None)
    km, dm = sift.detectAndCompute(cv2.cvtColor(small_mid, cv2.COLOR_BGR2GRAY), None)
    good = [a for a, b in cv2.BFMatcher().knnMatch(dm, df, k=2) if a.distance < 0.7 * b.distance]
    src = np.float32([km[g.queryIdx].pt for g in good])
    dst = np.float32([kf[g.trainIdx].pt for g in good])
    affine, inliers = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.0, maxIters=20000)
    if affine is None or int(inliers.sum()) < 30:
        raise SystemExit('the middle image does not match the full image; export and upscale this plate\'s centre instead')
    small = np.vstack([affine, [0, 0, 1]])
    return np.diag([1 / fs, 1 / fs, 1]) @ small @ np.diag([ms, ms, 1]), int(inliers.sum())


def warp_mid(mid, mid_to_full, size):
    detail_to_mid = np.linalg.inv(mid_to_full) @ detail_to_full_matrix(FULL_SIZE[0], FULL_SIZE[1], *size)
    flags = cv2.WARP_INVERSE_MAP
    warped = cv2.warpAffine(mid, detail_to_mid[:2], size, flags=cv2.INTER_LANCZOS4 | flags, borderMode=cv2.BORDER_REPLICATE)
    coverage = cv2.warpAffine(np.full(mid.shape[:2], 255, np.uint8), detail_to_mid[:2], size, flags=cv2.INTER_LINEAR | flags, borderValue=0)
    return warped, coverage


def full_centre(full, size):
    h, w = full.shape[:2]
    crop = full[h // 4: h * 3 // 4, w // 4: w * 3 // 4]
    return cv2.resize(crop, size, interpolation=cv2.INTER_CUBIC)


def refine(full, mid, mid_to_full):
    """ECC refinement of the residual alignment in the detail frame."""
    for width in (1536, 3072):
        size = (width, width * 2 // 3)
        warped, _ = warp_mid(mid, mid_to_full, size)
        target = cv2.GaussianBlur(cv2.cvtColor(full_centre(full, size), cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
        moving = cv2.GaussianBlur(cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
        residual = np.eye(2, 3, dtype=np.float32)
        try:
            _, residual = cv2.findTransformECC(target, moving, residual, cv2.MOTION_AFFINE,
                                               (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
        except cv2.error as error:
            print(f'  ECC at {width}px did not converge ({error}); keeping the previous alignment')
            continue
        # The residual maps detail-frame pixels to warped-mid pixels; fold it into mid_to_full.
        to_full = detail_to_full_matrix(FULL_SIZE[0], FULL_SIZE[1], *size)
        r = np.vstack([residual.astype(np.float64), [0, 0, 1]])
        mid_to_full = to_full @ np.linalg.inv(r) @ np.linalg.inv(to_full) @ mid_to_full
    return mid_to_full


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


PLATE_BAND = 28    # quarter-res px over which the plate changes from its own art to the middle image
DETAIL_START = 40  # the overlay only begins once the plate is fully replaced...
DETAIL_BAND = 48   # ...and then fades in over this distance


def low_pass(image, size, sigma):
    return cv2.GaussianBlur(cv2.resize(image, size, interpolation=cv2.INTER_AREA).astype(np.float32), (0, 0), sigma)


def build_masks(detail, target, coverage):
    """Plate replacement mask and detail alpha, nested so alpha > 0 only where the plate is fully replaced."""
    qsize = (DETAIL_SIZE[0] // 4, DETAIL_SIZE[1] // 4)
    diff = cv2.GaussianBlur(np.abs(low_pass(detail, qsize, 3) - low_pass(target, qsize, 3)).mean(axis=2), (0, 0), 4)
    agree = np.clip((AGREE_HIGH - diff) / (AGREE_HIGH - AGREE_LOW), 0, 1)
    covered = cv2.resize(coverage, qsize, interpolation=cv2.INTER_AREA) > 250
    binary = ndimage.binary_opening((agree > 0.5) & covered, structure=np.ones((3, 3)), iterations=6)
    labels, _ = ndimage.label(binary)
    centre = labels[qsize[1] // 2, qsize[0] // 2]
    if centre == 0:
        raise SystemExit('the middle image disagrees with the full image at the TV position')
    region = ndimage.binary_fill_holes(labels == centre)
    region = ndimage.binary_fill_holes(ndimage.binary_closing(region, structure=np.ones((3, 3)), iterations=12))
    border = np.zeros_like(region)
    border[1:-1, 1:-1] = True
    region &= border & covered
    # Both bands lie inside the agreeing region and inside the frame, so every blend mixes matching content.
    distance = cv2.GaussianBlur(ndimage.distance_transform_edt(region).astype(np.float32), (0, 0), 3)
    plate = smoothstep(distance / PLATE_BAND)
    alpha = smoothstep((distance - DETAIL_START) / DETAIL_BAND)
    upsize = lambda mask: cv2.resize(mask, DETAIL_SIZE, interpolation=cv2.INTER_LINEAR).clip(0, 1)
    return upsize(plate), upsize(alpha), agree, diff


def colour_match(detail, target, agree):
    """Give the detail the full plate's low frequencies wherever both agree."""
    qsize = (DETAIL_SIZE[0] // 4, DETAIL_SIZE[1] // 4)
    weight = cv2.GaussianBlur(agree.astype(np.float32), (0, 0), 3)[..., None]
    delta = (low_pass(target, qsize, 2.5) - low_pass(detail, qsize, 2.5)) * weight
    return np.clip(detail.astype(np.float32) + cv2.resize(delta, DETAIL_SIZE, interpolation=cv2.INTER_CUBIC), 0, 255)


def write_jpeg(path, bgr):
    Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(path, 'JPEG', quality=86, optimize=True, progressive=True, subsampling=0)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--room', required=True)
    parser.add_argument('--full', required=True, type=Path)
    parser.add_argument('--mid', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--export-center', type=Path, help='write the plate centre for re-upscaling when no matching middle exists')
    parser.add_argument('--qa', type=Path, help='directory for diagnostic images')
    args = parser.parse_args()
    full = load(args.full, FULL_SIZE)
    h, w = full.shape[:2]
    report = {'room': args.room}
    if args.export_center:
        args.export_center.mkdir(parents=True, exist_ok=True)
        centre = cv2.resize(full[h // 4: h * 3 // 4, w // 4: w * 3 // 4], (1536, 1024), interpolation=cv2.INTER_AREA)
        target = args.export_center / f'{args.room}-center-1536x1024.png'
        cv2.imwrite(str(target), centre)
        report['exported_center'] = str(target)
    if args.mid:
        mid = cv2.imread(str(args.mid), cv2.IMREAD_COLOR)
        mid_to_full, inliers = register(full, mid)
        mid_to_full = refine(full, mid, mid_to_full)
        detail, coverage = warp_mid(mid, mid_to_full, DETAIL_SIZE)
        target = full_centre(full, DETAIL_SIZE)
        plate_mask, alpha, agree, diff = build_masks(detail, target, coverage)
        detail = colour_match(detail, target, agree)
        # Bake the same picture into the plate so the layers differ only in sharpness.
        small_detail = cv2.resize(detail, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize(plate_mask, (w // 2, h // 2), interpolation=cv2.INTER_AREA)[..., None]
        centre = full[h // 4: h * 3 // 4, w // 4: w * 3 // 4].astype(np.float32)
        full = full.copy()
        full[h // 4: h * 3 // 4, w // 4: w * 3 // 4] = np.clip(centre * (1 - small_mask) + small_detail * small_mask, 0, 255).round().astype(np.uint8)
        rgba = np.dstack([cv2.cvtColor(detail.round().astype(np.uint8), cv2.COLOR_BGR2RGB), (alpha * 255).round().astype(np.uint8)])
        (args.out / 'detail').mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, 'RGBA').save(args.out / 'detail' / f'{args.room}.webp', 'WEBP', quality=90, method=6, alpha_quality=100)
        corners = mid_to_full @ np.array([[0, mid.shape[1]], [0, mid.shape[0]], [1, 1]], np.float64)
        report.update(inliers=inliers,
                      mid_rect=[round(v, 4) for v in (corners[0, 0] / w, corners[1, 0] / h, (corners[0, 1] - corners[0, 0]) / w, (corners[1, 1] - corners[1, 0]) / h)],
                      detail_area=round(float(alpha.mean()), 3), agreeing_mean_diff=round(float(diff[agree > 0.5].mean()), 2))
        if args.qa:
            args.qa.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(args.qa / f'{args.room}-alpha.png'), cv2.resize((alpha * 255).astype(np.uint8), (1536, 1024), interpolation=cv2.INTER_AREA))
            cv2.imwrite(str(args.qa / f'{args.room}-agreement.jpg'), cv2.applyColorMap(np.clip(diff * 6, 0, 255).astype(np.uint8), cv2.COLORMAP_INFERNO))
    write_jpeg(args.out / f'{args.room}.jpg', full)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
