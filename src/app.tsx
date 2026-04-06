import { useAppReducer } from "./hooks/useAppReducer";
import { createImageFile } from "./utils/imageUtils";
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

		const toastId = `import-${Date.now()}`;
		dispatch({
			type: "add_toast",
			toast: {
				id: toastId,
				message: `Importing 0/${rawFiles.length} images...`,
				progress: { current: 0, total: rawFiles.length },
			},
		});

		// Process files in sequence to avoid freezing.
		const imported = [];
		for (let i = 0; i < rawFiles.length; i++) {
			const imageFile = await createImageFile(rawFiles[i]!);
			imported.push(imageFile);
			dispatch({
				type: "update_toast",
				id: toastId,
				message: `Importing ${i + 1}/${rawFiles.length} images...`,
				progress: { current: i + 1, total: rawFiles.length },
			});
		}

		dispatch({ type: "import_files", files: imported, replace });
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
					onPolygonizeChange={(enabled) =>
						dispatch({ type: "set_polygonize", enabled })
					}
					onPolygonizeSidesChange={(sides) =>
						dispatch({ type: "set_polygonize_sides", sides })
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
					onLassoStart={(p) =>
						dispatch({ type: "start_lasso", point: p })
					}
					onLassoPoint={(p) =>
						dispatch({ type: "add_lasso_point", point: p })
					}
					onLassoComplete={() => dispatch({ type: "complete_lasso" })}
					onLassoCancel={() => dispatch({ type: "cancel_lasso" })}
					onAnnotationMoveStart={() => {}}
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
						if (droppedOnTrash && selectedFile) {
							dispatch({
								type: "delete_annotation",
								fileId: selectedFile.id,
								annotationId,
							});
						}
					}}
				/>
				<CanvasPalette
					classes={appState.general.classes}
					activeClassId={appState.ui.activeClassId}
					position={appState.ui.palettePosition}
					onSelectClass={(id) =>
						dispatch({ type: "set_active_class", classId: id })
					}
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
