import { AppProps } from "../../../base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AdminMenuBar } from "../AdminMenuBar";
import { useMemo } from "react";
import { useAdminLogic } from "../../hooks/useAdminLogic";
import { AdminRestrictedView } from "./AdminRestrictedView";
import { AdminMainPane } from "./AdminMainPane";
import { AdminAppDialogs } from "./AdminAppDialogs";
import {
  getShouldShowAdminImportStatus,
  getAdminImportProgressPercent,
  getAdminImportStatusText,
} from "./adminImportStatus";

export function AdminAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    username,
    isAdmin,
    isOffline,
    currentTheme,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deleteTarget,
    users,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    roomMessages,
    userSearch,
    setUserSearch,
    isLoading,
    visibleUsersCount,
    setVisibleUsersCount,
    USERS_PER_PAGE,
    stats,
    activeSection,
    setActiveSection,
    cursorAgentsRefreshSignal,
    setCursorAgentCount,
    isRoomsExpanded,
    setIsRoomsExpanded,
    selectedUserProfile,
    setSelectedUserProfile,
    selectedSongId,
    setSelectedSongId,
    songs,
    songSearch,
    setSongSearch,
    songsFilterByRyoOnly,
    setSongsFilterByRyoOnly,
    visibleSongsCount,
    setVisibleSongsCount,
    SONGS_PER_PAGE,
    containerRef,
    scrollAreaRef,
    isSidebarVisible,
    toggleSidebarVisibility,
    isImporting,
    importStatus,
    isExporting,
    isDeletingAll,
    fileInputRef,
    selectedRoom,
    fetchUsers,
    fetchStats,
    fetchSongs,
    deleteMessage,
    handleImportFile,
    handleExportLibrary,
    handleDeleteAllSongs,
    handleDeleteConfirm,
    handleRefresh,
    promptDelete,
    formatRelativeTime,
    formatKugouImageUrl,
  } = useAdminLogic({ isWindowOpen });

  const menuBar = (
    <AdminMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onRefresh={handleRefresh}
      onToggleSidebar={toggleSidebarVisibility}
      isSidebarVisible={isSidebarVisible}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      rooms={rooms}
      selectedRoomId={selectedRoomId}
      onRoomSelect={setSelectedRoomId}
    />
  );

  const filteredSongs = useMemo(() => {
    const normalizedSearch = songSearch.toLowerCase();

    return songs.filter((song) => {
      if (songsFilterByRyoOnly && song.createdBy?.toLowerCase() !== "ryo") {
        return false;
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      return (
        song.title.toLowerCase().includes(normalizedSearch) ||
        (song.artist?.toLowerCase().includes(normalizedSearch) ?? false)
      );
    });
  }, [songs, songsFilterByRyoOnly, songSearch]);

  const shouldShowImportStatus = getShouldShowAdminImportStatus(
    activeSection,
    selectedRoomId,
    selectedUserProfile,
    selectedSongId,
    importStatus,
  );
  const isMacOSXTheme = currentTheme === "macosx";
  const importProgressPercent = getAdminImportProgressPercent(importStatus);
  const importStatusText = getAdminImportStatusText(importStatus, t);

  if (!isAdmin) {
    return (
      <AdminRestrictedView
        variant="accessDenied"
        t={t}
        username={username}
        isWindowOpen={isWindowOpen}
        isWindowsTheme={isWindowsTheme}
        menuBar={menuBar}
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      />
    );
  }

  if (isOffline) {
    return (
      <AdminRestrictedView
        variant="offline"
        t={t}
        username={username}
        isWindowOpen={isWindowOpen}
        isWindowsTheme={isWindowsTheme}
        menuBar={menuBar}
        onClose={onClose}
        isForeground={isForeground}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      />
    );
  }

  const showCursorAgentsPanel =
    activeSection === "cursorAgents" &&
    !selectedRoomId &&
    !selectedUserProfile &&
    !selectedSongId;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.admin.title"),
        onClose,
        isForeground,
        appId: "admin",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
    >
      <AdminMainPane
          containerRef={containerRef}
          scrollAreaRef={scrollAreaRef}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          setSelectedRoomId={setSelectedRoomId}
          isRoomsExpanded={isRoomsExpanded}
          setIsRoomsExpanded={setIsRoomsExpanded}
          stats={stats}
          isSidebarVisible={isSidebarVisible}
          selectedUserProfile={selectedUserProfile}
          selectedSongId={selectedSongId}
          currentTheme={currentTheme}
          isWindowsTheme={isWindowsTheme}
          t={t}
          userSearch={userSearch}
          setUserSearch={setUserSearch}
          songSearch={songSearch}
          setSongSearch={setSongSearch}
          songsFilterByRyoOnly={songsFilterByRyoOnly}
          setSongsFilterByRyoOnly={setSongsFilterByRyoOnly}
          songs={songs}
          isImporting={isImporting}
          isExporting={isExporting}
          isDeletingAll={isDeletingAll}
          importStatus={importStatus}
          fileInputRef={fileInputRef}
          handleImportFile={handleImportFile}
          handleExportLibrary={handleExportLibrary}
          handleDeleteAllSongs={handleDeleteAllSongs}
          handleRefresh={handleRefresh}
          isLoading={isLoading}
          promptDelete={promptDelete}
          roomMessages={roomMessages}
          selectedRoom={selectedRoom}
          shouldShowImportStatus={shouldShowImportStatus}
          isMacOSXTheme={isMacOSXTheme}
          importProgressPercent={importProgressPercent}
          importStatusText={importStatusText}
          showCursorAgentsPanel={showCursorAgentsPanel}
          cursorAgentsRefreshSignal={cursorAgentsRefreshSignal}
          setCursorAgentCount={setCursorAgentCount}
          users={users}
          visibleUsersCount={visibleUsersCount}
          setVisibleUsersCount={setVisibleUsersCount}
          USERS_PER_PAGE={USERS_PER_PAGE}
          filteredSongs={filteredSongs}
          visibleSongsCount={visibleSongsCount}
          setVisibleSongsCount={setVisibleSongsCount}
          SONGS_PER_PAGE={SONGS_PER_PAGE}
          setSelectedUserProfile={setSelectedUserProfile}
          setSelectedSongId={setSelectedSongId}
          fetchUsers={fetchUsers}
          fetchStats={fetchStats}
          fetchSongs={fetchSongs}
          formatRelativeTime={formatRelativeTime}
          formatKugouImageUrl={formatKugouImageUrl}
          deleteMessage={deleteMessage}
          username={username}
        />

      <AdminAppDialogs
        isHelpDialogOpen={isHelpDialogOpen}
        setIsHelpDialogOpen={setIsHelpDialogOpen}
        translatedHelpItems={translatedHelpItems}
        isAboutDialogOpen={isAboutDialogOpen}
        setIsAboutDialogOpen={setIsAboutDialogOpen}
        isDeleteDialogOpen={isDeleteDialogOpen}
        setIsDeleteDialogOpen={setIsDeleteDialogOpen}
        deleteTarget={deleteTarget}
        onDeleteConfirm={handleDeleteConfirm}
        t={t}
      />
    </AppWindowShell>
  );
}
