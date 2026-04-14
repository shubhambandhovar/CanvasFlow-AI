import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, LogOut, Sparkles, ExternalLink, Trash2, User, Moon, Sun, Laptop, Star, Search } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { useTheme } from 'next-themes';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PRESET_AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Zoey",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Jack",
  "https://api.dicebear.com/7.x/bottts/svg?seed=Robot"
];

export const DashboardPage = () => {
  const { user, logout, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  const [newBoardTemplate, setNewBoardTemplate] = useState('blank');
  const [creating, setCreating] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTheme, setEditTheme] = useState('system');
  const [editPassword, setEditPassword] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const response = await axios.get(`${API}/boards`);
      setBoards(response.data);
    } catch (error) {
      toast.error('Failed to load boards');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await axios.post(`${API}/boards`, {
        title: newBoardTitle,
        description: newBoardDescription,
        template: newBoardTemplate
      });
      toast.success('Board created!');
      setBoards([response.data, ...boards]);
      setCreateDialogOpen(false);
      setNewBoardTitle('');
      setNewBoardDescription('');
      setNewBoardTemplate('blank');
    } catch (error) {
      toast.error('Failed to create board');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const updateData = { name: editName, theme: editTheme };
      if (editPassword) updateData.password = editPassword;
      if (editAvatarUrl !== user?.avatar_url) updateData.avatar_url = editAvatarUrl;
      
      await updateProfile(updateData);
      setTheme(editTheme);
      toast.success('Profile updated successfully!');
      setProfileDialogOpen(false);
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Are you critically sure? This will delete your account and ALL your boards permanently. This action CANNOT be undone.")) return;
    
    setDeletingAccount(true);
    try {
      await deleteAccount();
      toast.success('Account successfully deleted');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to delete account');
      setDeletingAccount(false);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!window.confirm('Are you sure you want to delete this board?')) return;

    try {
      await axios.delete(`${API}/boards/${boardId}`);
      toast.success('Board deleted');
      setBoards(boards.filter(b => b.id !== boardId));
    } catch (error) {
      toast.error('Failed to delete board');
    }
  };

  const handleToggleStar = async (boardId) => {
    const isStarred = user?.starred_boards?.includes(boardId);
    let newStarredBoards = [];
    if (isStarred) {
      newStarredBoards = (user?.starred_boards || []).filter(id => id !== boardId);
    } else {
      newStarredBoards = [...(user?.starred_boards || []), boardId];
    }
    
    try {
      await updateProfile({ starred_boards: newStarredBoards });
      toast.success(isStarred ? 'Board unstarred' : 'Board starred!');
    } catch (error) {
      toast.error('Failed to update favorites');
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Image is too large. Please choose under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditAvatarUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0A1929]">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-black/5">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold" style={{letterSpacing: '-0.02em'}}>CanvasFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-primary/20 shadow-sm" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shadow-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium leading-none" data-testid="user-name">{user?.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider mt-1">
                  <span className={`px-1.5 py-0.5 rounded-sm ${user?.tier === 'PRO' ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'}`}>
                    {user?.tier || 'Free'} Plan
                  </span>
                </span>
              </div>
            </div>
            <Dialog open={profileDialogOpen} onOpenChange={(open) => {
              setProfileDialogOpen(open);
              if (open) {
                setEditName(user?.name || '');
                setEditTheme(user?.theme || 'system');
                setEditAvatarUrl(user?.avatar_url || '');
                setEditPassword('');
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-full">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateProfile} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2 pb-2">
                  <div className="flex items-start gap-4 py-2">
                    {editAvatarUrl ? (
                      <img src={editAvatarUrl} alt="Preview" className="w-16 h-16 rounded-full object-cover border shadow-sm" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold border shadow-sm">
                        {editName ? editName.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <div className="space-y-3 flex-1">
                      <div>
                        <Label>Custom Upload</Label>
                        <Input type="file" accept="image/*" onChange={handleAvatarUpload} className="cursor-pointer file:text-primary file:font-semibold h-9 mt-1" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground mr-2">Or choose a preset:</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {PRESET_AVATARS.map((url, i) => (
                            <img 
                              key={i}
                              src={url}
                              alt={`Preset ${i}`}
                              className={`w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-transform ${editAvatarUrl === url ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'opacity-70 hover:opacity-100'}`}
                              onClick={() => setEditAvatarUrl(url)}
                            />
                          ))}
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs ml-auto text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEditAvatarUrl('')}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-name">Display Name</Label>
                    <Input
                      id="edit-name"
                      placeholder="Your Name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>New Password (Optional)</Label>
                    <Input 
                      type="password" 
                      placeholder="Leave blank to keep current" 
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Email (Read-only)</Label>
                    <Input disabled value={user?.email || ''} className="bg-muted cursor-not-allowed" />
                  </div>
                  
                  <div className="space-y-1">
                    <Label>App Theme</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={editTheme === 'light' ? 'default' : 'outline'}
                        className="flex-1 rounded-xl"
                        onClick={() => setEditTheme('light')}
                      >
                        <Sun className="w-4 h-4 mr-2" /> Light
                      </Button>
                      <Button
                        type="button"
                        variant={editTheme === 'dark' ? 'default' : 'outline'}
                        className="flex-1 rounded-xl"
                        onClick={() => setEditTheme('dark')}
                      >
                        <Moon className="w-4 h-4 mr-2" /> Dark
                      </Button>
                      <Button
                        type="button"
                        variant={editTheme === 'system' ? 'default' : 'outline'}
                        className="flex-1 rounded-xl"
                        onClick={() => setEditTheme('system')}
                      >
                        <Laptop className="w-4 h-4 mr-2" /> System
                      </Button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full rounded-full mt-4" disabled={updatingProfile}>
                    {updatingProfile ? 'Saving...' : 'Save Changes'}
                  </Button>
                </form>
                
                <div className="mt-8 pt-6 border-t border-destructive/20">
                  <h4 className="text-sm font-semibold text-destructive mb-2">Danger Zone</h4>
                  <p className="text-xs text-muted-foreground mb-4">Once you delete your account, there is no going back. Please be certain.</p>
                  <Button 
                    variant="destructive" 
                    className="w-full rounded-full" 
                    disabled={deletingAccount}
                    onClick={handleDeleteAccount}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {deletingAccount ? 'Deleting...' : 'Delete Account Permanently'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="rounded-full"
              data-testid="logout-button"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{letterSpacing: '-0.02em'}} data-testid="dashboard-title">
              My Boards
            </h1>
            <p className="text-muted-foreground">Create and manage your collaborative whiteboards</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full h-11 px-6" data-testid="create-board-button">
                <Plus className="w-5 h-5 mr-2" />
                New Board
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Board</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateBoard} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title" data-testid="board-title-label">Board Title</Label>
                  <Input
                    id="title"
                    placeholder="My Awesome Board"
                    value={newBoardTitle}
                    onChange={(e) => setNewBoardTitle(e.target.value)}
                    required
                    data-testid="board-title-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" data-testid="board-description-label">Description (optional)</Label>
                  <Input
                    id="description"
                    placeholder="A brief description..."
                    value={newBoardDescription}
                    onChange={(e) => setNewBoardDescription(e.target.value)}
                    data-testid="board-description-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Starting Template</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <Button 
                      type="button" 
                      variant={newBoardTemplate === 'blank' ? 'default' : 'outline'} 
                      onClick={() => setNewBoardTemplate('blank')}
                      className="rounded-xl h-10 w-full"
                    >
                      Blank Canvas
                    </Button>
                    <Button 
                      type="button" 
                      variant={newBoardTemplate === 'mindmap' ? 'default' : 'outline'} 
                      onClick={() => setNewBoardTemplate('mindmap')}
                      className="rounded-xl h-10 w-full"
                    >
                      Mind Map
                    </Button>
                    <Button 
                      type="button" 
                      variant={newBoardTemplate === 'flowchart' ? 'default' : 'outline'} 
                      onClick={() => setNewBoardTemplate('flowchart')}
                      className="rounded-xl h-10 w-full col-span-2"
                    >
                      Flowchart Base
                    </Button>
                  </div>
                </div>

                <Button type="submit" className="w-full rounded-full" disabled={creating} data-testid="create-board-submit">
                  {creating ? 'Creating...' : 'Create Board'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search Bar */}
        {(boards.length > 0 || searchQuery !== '') && (
          <div className="mb-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search boards by title or description..." 
              className="pl-10 h-11 rounded-xl bg-white/50 dark:bg-black/50 backdrop-blur-sm shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Boards Grid */}
        {loading ? (
          <div className="text-center py-12" data-testid="loading-state">
            <p className="text-muted-foreground">Loading boards...</p>
          </div>
        ) : boards.length === 0 && searchQuery === '' ? (
          <div className="text-center py-12 glass rounded-2xl" data-testid="empty-state">
            <p className="text-muted-foreground mb-4">No boards yet. Create your first board to get started!</p>
            <Button onClick={() => setCreateDialogOpen(true)} className="rounded-full" data-testid="empty-create-button">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Board
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="boards-grid">
            {[...boards]
              .filter(board => 
                board.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (board.description || '').toLowerCase().includes(searchQuery.toLowerCase())
              )
              .sort((a, b) => {
                const aStarred = user?.starred_boards?.includes(a.id) ? 1 : 0;
                const bStarred = user?.starred_boards?.includes(b.id) ? 1 : 0;
                return bStarred - aStarred;
              })
              .map((board) => {
                const isStarred = user?.starred_boards?.includes(board.id);
                return (
                <div
                key={board.id}
                className="glass rounded-2xl p-6 hover:bg-white/80 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
                data-testid={`board-card-${board.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold truncate flex-1" data-testid="board-title">{board.title}</h3>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-8 w-8 p-0 rounded-full transition-opacity ${isStarred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStar(board.id);
                      }}
                      data-testid="star-board-button"
                    >
                      <Star className={`w-4 h-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBoard(board.id);
                      }}
                      data-testid="delete-board-button"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {board.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2" data-testid="board-description">
                    {board.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span>{board.objects?.length || 0} objects</span>
                  <span>Version {board.version}</span>
                </div>
                <Button
                  className="w-full rounded-full"
                  onClick={() => navigate(`/board/${board.id}`)}
                  data-testid="open-board-button"
                >
                  Open Board
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )})}
          </div>
        )}
      </main>
    </div>
  );
};
