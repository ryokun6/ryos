import { AppProps } from "../../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
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
    isXpTheme,
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
    />
  );

  const filteredSongs = useMemo(() => {
    let list = songs;
    if (songsFilterByRyoOnly) {
      list = list.filter((s) => s.createdBy?.toLowerCase() === "ryo");
    }
    if (songSearch.length > 0) {
      list = list.filter(
        (song) =>
          song.title.toLowerCase().includes(songSearch.toLowerCase()) ||
          (song.artist
            ?.toLowerCase()
            .includes(songSearch.toLowerCase()) ?? false),
      );
    }
    return list;
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

  if (!isWindowOpen) return null;

  if (!isAdmin) {
    return (
      <AdminRestrictedView
        variant="accessDenied"
        t={t}
        username={username}
        isXpTheme={isXpTheme}
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
        isXpTheme={isXpTheme}
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
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.admin.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="admin"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
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
          isXpTheme={isXpTheme}
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
      </WindowFrame>
    </>
  );
}
