# UI

The high level UI of the annotation app.

## Sidebar

- Left sidebar, but should be designed to work on either side.
- Resize handle near the top users can grab to make the sidebar larger or smaller.
- Collapses under a certain width percentage to be invisible (except for some method to expand it). Stays rendered, just hidden.

```tsx
<Sidebar collapsed widthPercent={10} onResize={newWidthPercent => ...}>
    <FileList {...}>
        </>
    </FileList>
</Sidebar>
```

## FileList

- Container for `FileListItems`.
- Header that says `Files`.
- Search bar underneath to narrow files by name.
- List of `FileListItems`.
- Underneath the file list container is a square with two buttons, `Import`, `Export`
  - `Import` opens modal overlay:
    - Replace current file list? (checkbox)
    - File path input (uploads all the images in the folder)
    - Done / Cancel
  - `Export` opens model overlay:
    - Exports all the annotations as a ZIP
    - User can choose output format, `YOLO`, `Cocoa`, etc.
    - Done / Cancel

```tsx
<FileList>
    <SearchInput value={appState.searchInput} onChange={...} />
    {appState.filteredFiles.map(file => (
        <FileListItem name={file.name} thumbnailSrc={file.thumbnailBase64} onSelect={...} onDelete={...} />
    ))}
</FileList>
```

## FileListItem

Displays:

- File name.
- A thumbnail of the image.
- A `-` icon to remove the file from the list.
  - Should also have an `UndoButton` added to the `FileList` in-case user wants to undo deletion.
- Tapping the `FileListItem` should select it and set it as the canvas image.

```tsx
<FileListItem name={file.name} thumbnailSrc={file.thumbnailBase64} onSelect={() => dispatch(..., file)} onDelete={() => dispatch(..., file)} />
```

## Canvas

Annotation area of the app. Should take up most of the screen.

- Drawing on the canvas creates an `AnnotationLasso` with the selected class color.
  - If the user picks up the stylus before completing the lasso, the `AnnotationLasso` is deleted.
  - If the user finishes the lasso, it becomes an `Annotation` of the given class.
- Image is downscaled or upscaled to fit the canvas area. Annotation coordinates are stored as relative values from 0 to 1.

## CanvasPalette

Floating overlay on the canvas.

- Draggable if the user wants to move it around.
- Contains a list of `Pills` that have a given class name, eg `tiger` or `bunny` to annotate those classes.
  - `Pills` should have a `-` icon to the right, so that they can be deleted.
  - Active/selected `Pill` should be clearly shown.
  - Starts with a default pill, `default-class`.
- Bottom row:
  - Plus icon to add a new class.
    - Clicking creates a `Pill` with an `Input` text area, so user can enter the name of the new class (`Enter` sets it).
    - Chooses a random color for the `Pill`/class that does not look too similar to the existing `Pill`s.
  - Forward icon to go to the next Image in the `FileList`.
  - Backward icon to go to the previous Image in the `FileList`.

## Annotation

After the user finishes a lasso, it becomes an `Annotation`.

- Should be movable if the user taps and holds the inner area.
- Should use the class color and be opaque so user can see underneath.
- Should not grab focus if the user is drawing within it (to create another inner annotation).
- The edges should be slightly darker.
- The user should be able to tap an edge and drag it to move that point.

## SystemToast

- Used to display progress, eg when uploading 60 images, displays "N/60 images imported" with a loading spinner.
- Shown in the bottom right corner.
- Multiple `SystemToasts` stack on top of each other.
