import { useRef, useState } from "react";
import { useAppReducer } from "./hooks/useAppReducer";
import { createImageFile } from "./utils/imageUtils";
import {
	collectJsonClassNames,
	collectVocClassNames,
	detectYoloMaxIndex,
	isLabelMeFormat,
	parseCocoAnnotations,
	parseJsonAnnotation,
	parseLabelMeAnnotation,
	parseVocAnnotation,
	parseYoloAnnotation,
	parseYoloClasses,
	resolveClasses,
} from "./utils/importUtils";
import type { CocoData } from "./utils/importUtils";
import { exportAsZip } from "./services/exportService";
import { Sidebar } from "./components/Sidebar";
import { FileList } from "./components/FileList";
import { Canvas } from "./components/Canvas";
import { CanvasPalette } from "./components/CanvasPalette";
import { ImportModal } from "./components/ImportModal";
import { ExportModal } from "./components/ExportModal";
import { SystemToast } from "./components/SystemToast";
import styles from "./app.module.css";

export function App() {
	const [appState, dispatch] = useAppReducer();
	const [isDraggingAnnotation, setIsDraggingAnnotation] = useState(false);
	const trashRef = useRef<HTMLDivElement>(null);

	// -- Derived values --

	const filteredFiles = appState.ui.searchQuery
		? appState.general.files.filter((f) =>
				f.name
					.toLowerCase()
					.includes(appState.ui.searchQuery.toLowerCase()),
			)
		: appState.general.files;

	const selectedFile = appState.general.files.find(
		(f) => f.id === appState.ui.selectedFileId,
	);

	// -- Handlers --

	const handleImport = async (rawFiles: File[], replace: boolean) => {
		dispatch({ type: "close_import_modal" });

		// Separate files by type.
		const imageFiles: File[] = [];
		const txtFiles = new Map<string, File>();
		const jsonFiles = new Map<string, File>();
		const xmlFiles = new Map<string, File>();
		let classesFile: File | null = null;
		let cocoFile: File | null = null;

		for (const file of rawFiles) {
			if (file.type.startsWith("image/")) {
				imageFiles.push(file);
			} else if (file.name === "classes.txt") {
				classesFile = file;
			} else if (file.name === "annotations.json") {
				cocoFile = file;
			} else if (file.name.endsWith(".txt")) {
				txtFiles.set(file.name.replace(/\.txt$/, ""), file);
			} else if (file.name.endsWith(".xml")) {
				xmlFiles.set(file.name.replace(/\.xml$/, ""), file);
			} else if (file.name.endsWith(".json")) {
				jsonFiles.set(file.name.replace(/\.json$/, ""), file);
			}
		}

		// Parse annotations if present.
		let annotationMap = new Map<string, import("./types/appState").Annotation[]>();
		let newClasses: import("./types/appState").AnnotationClass[] = [];

		if (cocoFile) {
			// COCO format
			const cocoData: CocoData = JSON.parse(await cocoFile.text());
			const entries = cocoData.categories.map((c) => ({
				key: c.id,
				name: c.name,
			}));
			const resolved = resolveClasses(entries, appState.general.classes);
			newClasses = resolved.newClasses;
			annotationMap = parseCocoAnnotations(cocoData, resolved.classMap);
		} else if (xmlFiles.size > 0) {
			// Pascal VOC format
			const xmlContents = new Map<string, string>();
			for (const [base, file] of xmlFiles) {
				xmlContents.set(base, await file.text());
			}

			const classNames = collectVocClassNames(xmlContents.values());
			const entries = classNames.map((name, i) => ({ key: i, name }));
			const resolved = resolveClasses(entries, appState.general.classes);
			newClasses = resolved.newClasses;

			const classByName = new Map<string, string>();
			for (const { key, name } of entries) {
				classByName.set(name, resolved.classMap.get(key) ?? "");
			}

			for (const [base, text] of xmlContents) {
				const anns = parseVocAnnotation(text, classByName);
				if (anns.length > 0) annotationMap.set(base, anns);
			}
		} else if (txtFiles.size > 0) {
			// YOLO format
			const txtContents = new Map<string, string>();
			for (const [base, file] of txtFiles) {
				txtContents.set(base, await file.text());
			}

			let classNames: string[];
			if (classesFile) {
				classNames = parseYoloClasses(await classesFile.text());
			} else {
				const maxIdx = detectYoloMaxIndex(txtContents.values());
				classNames = Array.from(
					{ length: maxIdx + 1 },
					(_, i) => `class-${i}`,
				);
			}

			const entries = classNames.map((name, i) => ({ key: i, name }));
			const resolved = resolveClasses(entries, appState.general.classes);
			newClasses = resolved.newClasses;

			for (const [base, text] of txtContents) {
				const anns = parseYoloAnnotation(text, resolved.classMap);
				if (anns.length > 0) annotationMap.set(base, anns);
			}
		} else if (jsonFiles.size > 0) {
			// Per-image JSON or LabelMe format (auto-detected per file)
			const jsonContents = new Map<string, string>();
			for (const [base, file] of jsonFiles) {
				jsonContents.set(base, await file.text());
			}

			const classNames = collectJsonClassNames(jsonContents.values());
			const entries = classNames.map((name, i) => ({ key: i, name }));
			const resolved = resolveClasses(entries, appState.general.classes);
			newClasses = resolved.newClasses;

			const classByName = new Map<string, string>();
			for (const { key, name } of entries) {
				classByName.set(name, resolved.classMap.get(key) ?? "");
			}

			for (const [base, text] of jsonContents) {
				try {
					const parsed = JSON.parse(text);
					const anns = isLabelMeFormat(parsed)
						? parseLabelMeAnnotation(text, classByName)
						: parseJsonAnnotation(text, classByName);
					if (anns.length > 0) annotationMap.set(base, anns);
				} catch {
					// skip malformed files
				}
			}
		}

		// Import images with matched annotations.
		const toastId = `import-${Date.now()}`;
		dispatch({
			type: "add_toast",
			toast: {
				id: toastId,
				message: `Importing 0/${imageFiles.length} images...`,
				progress: { current: 0, total: imageFiles.length },
			},
		});

		const imported = [];
		for (let i = 0; i < imageFiles.length; i++) {
			const imgFile = imageFiles[i]!;
			const imageFile = await createImageFile(imgFile);

			const baseName = imgFile.name.replace(/\.[^.]+$/, "");
			const matchedAnnotations = annotationMap.get(baseName);
			if (matchedAnnotations) {
				imageFile.annotations = matchedAnnotations;
			}

			imported.push(imageFile);
			dispatch({
				type: "update_toast",
				id: toastId,
				message: `Importing ${i + 1}/${imageFiles.length} images...`,
				progress: { current: i + 1, total: imageFiles.length },
			});
		}

		dispatch({
			type: "import_files",
			files: imported,
			importClasses: newClasses,
			replace,
		});
		dispatch({ type: "remove_toast", id: toastId });
	};

	const handleExport = async () => {
		dispatch({ type: "close_export_modal" });
		await exportAsZip(
			appState.general.files,
			appState.general.classes,
			appState.general.exportFormat,
		);
	};

	const handlePillClick = (classId: string) => {
		dispatch({ type: "set_active_class", classId });
		if (appState.ui.selectedAnnotationId && selectedFile) {
			dispatch({
				type: "change_annotation_class",
				fileId: selectedFile.id,
				annotationId: appState.ui.selectedAnnotationId,
				classId,
			});
		}
	};

	return (
		<div className={styles.appContainer}>
			{/* Sidebar with file list */}
			<Sidebar
				collapsed={appState.ui.sidebarCollapsed}
				widthPercent={appState.ui.sidebarWidthPercent}
				side="left"
				onResize={(pct) =>
					dispatch({ type: "set_sidebar_width", widthPercent: pct })
				}
			>
				<FileList
					files={filteredFiles}
					selectedFileId={appState.ui.selectedFileId}
					searchQuery={appState.ui.searchQuery}
					lastDeletedFile={appState.general.lastDeletedFile}
					onSearchChange={(q) =>
						dispatch({ type: "set_search_query", query: q })
					}
					onSelectFile={(id) =>
						dispatch({ type: "select_file", fileId: id })
					}
					onDeleteFile={(id) =>
						dispatch({ type: "delete_file", fileId: id })
					}
					onUndoDelete={() => dispatch({ type: "undo_delete_file" })}
					onImportClick={() => dispatch({ type: "open_import_modal" })}
					onExportClick={() => dispatch({ type: "open_export_modal" })}
					polygonize={appState.general.polygonize}
					polygonizeSides={appState.general.polygonizeSides}
					stretchImage={appState.ui.stretchImage}
					onPolygonizeChange={(enabled) =>
						dispatch({ type: "set_polygonize", enabled })
					}
					onPolygonizeSidesChange={(sides) =>
						dispatch({ type: "set_polygonize_sides", sides })
					}
					onStretchImageChange={(enabled) =>
						dispatch({ type: "set_stretch_image", enabled })
					}
				/>
			</Sidebar>

			{/* Canvas area with palette overlay */}
			<div className={styles.canvasArea}>
				<Canvas
					imageDataUrl={selectedFile?.dataUrl ?? null}
					annotations={selectedFile?.annotations ?? []}
					classes={appState.general.classes}
					activeLassoPoints={appState.ui.activeLassoPoints}
					activeClassId={appState.ui.activeClassId}
					selectedAnnotationId={appState.ui.selectedAnnotationId}
					stretchImage={appState.ui.stretchImage}
					trashRef={trashRef}
					onLassoStart={(p) =>
						dispatch({ type: "start_lasso", point: p })
					}
					onLassoPoint={(p) =>
						dispatch({ type: "add_lasso_point", point: p })
					}
					onLassoComplete={() => dispatch({ type: "complete_lasso" })}
					onLassoCancel={() => dispatch({ type: "cancel_lasso" })}
					onAnnotationMoveStart={(annotationId) => {
						setIsDraggingAnnotation(true);
						dispatch({ type: "select_annotation", annotationId });
					}}
					onAnnotationMove={(annotationId, delta) => {
						if (!selectedFile) return;
						dispatch({
							type: "move_annotation",
							fileId: selectedFile.id,
							annotationId,
							delta,
						});
					}}
					onAnnotationMoveEnd={(annotationId, droppedOnTrash) => {
						setIsDraggingAnnotation(false);
						if (droppedOnTrash && selectedFile) {
							dispatch({
								type: "delete_annotation",
								fileId: selectedFile.id,
								annotationId,
							});
						}
					}}
					onSelectAnnotation={(annotationId) =>
						dispatch({ type: "select_annotation", annotationId })
					}
				/>
				<CanvasPalette
					classes={appState.general.classes}
					activeClassId={appState.ui.activeClassId}
					position={appState.ui.palettePosition}
					isDraggingAnnotation={isDraggingAnnotation}
					trashRef={trashRef}
					onSelectClass={handlePillClick}
					onDeleteClass={(id) =>
						dispatch({ type: "delete_class", classId: id })
					}
					onAddClass={(name, color) =>
						dispatch({ type: "add_class", name, color })
					}
					onNavigate={(dir) =>
						dispatch({ type: "navigate_file", direction: dir })
					}
					onDragEnd={(pos) =>
						dispatch({ type: "set_palette_position", position: pos })
					}
				/>
			</div>

			{/* Modals */}
			<ImportModal
				open={appState.ui.importModalOpen}
				onImport={handleImport}
				onCancel={() => dispatch({ type: "close_import_modal" })}
			/>
			<ExportModal
				open={appState.ui.exportModalOpen}
				exportFormat={appState.general.exportFormat}
				onFormatChange={(f) =>
					dispatch({ type: "set_export_format", format: f })
				}
				onExport={handleExport}
				onCancel={() => dispatch({ type: "close_export_modal" })}
			/>

			{/* Toasts */}
			<SystemToast toasts={appState.ui.toasts} />
		</div>
	);
}
